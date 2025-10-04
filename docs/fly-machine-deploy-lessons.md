# Fly Machine Deployment: Critical Lessons Learned

**Problem**: It took two days to figure out how to get the proper latest image used in UI-provisioned machines.

This document explains what we learned to prevent getting stuck on this again.

## Key Lessons Learned

### 1. **Fly.io Image Tags vs Deployment Tags**
- **Problem**: Using `:latest` tag doesn't guarantee the actual latest code
- **Why**: The `:latest` tag is just a pointer that doesn't automatically update when you deploy new code
- **Solution**: Always use **specific deployment tags** (e.g., `deployment-01K6PSH90XY4M9T7JN7QTSXDEH`)

### 2. **How UI-Provisioned Machines Get Their Image**
The app provisions machines through this flow:
```
User clicks "Start Machine"
  → Supabase Edge Function `provision-machine`
  → Reads env var `DOCKER_IMAGE` (line 197 in provision-machine/index.ts)
  → Creates Fly machine with that image
```

**CRITICAL**: The image comes from the **Supabase secret `DOCKER_IMAGE`**, NOT from fly.toml or any other config.

### 3. **The Correct Deployment Workflow**
```bash
# Step 1: Build new image with specific tag
fly deploy -a vyx-app -c server/fly-machine/fly.toml --build-only --push

# Step 2: Note the deployment tag from output
# Example: registry.fly.io/vyx-app:deployment-01K6PSH90XY4M9T7JN7QTSXDEH

# Step 3: Update Supabase Edge Function to use new image
supabase secrets set DOCKER_IMAGE=registry.fly.io/vyx-app:deployment-01K6PSH90XY4M9T7JN7QTSXDEH

# Step 4: Test by clicking "Start Machine" in UI
```

### 4. **Docker Multi-Stage Build Gotchas**
- **Problem**: TypeScript compiled files were in `dist/server/fly-machine/` but we tried to copy from `dist/`
- **Root cause**: `tsconfig.json` has `outDir: "./dist"` but preserves directory structure
- **Fix**: Copy from the ACTUAL compiled location:
  ```dockerfile
  # WRONG (files not found)
  COPY --from=builder /build/server/fly-machine/dist ./dist

  # CORRECT (matches actual TypeScript output structure)
  COPY --from=builder /build/server/fly-machine/dist/server/fly-machine ./dist
  COPY --from=builder /build/server/fly-machine/dist/apps ./dist/apps
  ```

### 5. **Verification Checklist**
Before deploying, always verify:

- [ ] **Build succeeded**: Check build logs for compilation errors
- [ ] **Image was pushed**: Note the deployment tag from build output
- [ ] **DOCKER_IMAGE secret updated**: Run `supabase secrets list` to verify
- [ ] **Test provision**: Click "Start Machine" in UI and watch logs
- [ ] **Check actual image used**: Look at Fly logs to see which image was pulled

### 6. **Debugging Auto-Destroying Machines**
When machines auto-destroy (as happened multiple times):
- `auto_destroy: true` + `restart.max_retries: 3` means it tries 3 times then destroys
- **Always check Fly logs immediately** to see the startup error:
  ```bash
  fly logs -a vyx-app -f
  ```
- Common errors:
  - `Cannot find module` → Wrong COPY paths in Dockerfile
  - Health check failures → App not listening on correct port
  - Environment variable missing → Check provision-machine passes all needed vars

### 7. **Build Context Matters**
- Dockerfile must be run from **project root** (not server/fly-machine)
- Use: `fly deploy -c server/fly-machine/fly.toml` (note the -c flag for config path)
- This ensures COPY commands can access `apps/app/` files

## Prevention Strategy

### 1. Document in Code
Add a comment to `supabase/functions/provision-machine/index.ts`:

```typescript
// CRITICAL: This env var controls which Docker image is used for ALL user-provisioned machines
// To update:
// 1. Build: fly deploy -a vyx-app -c server/fly-machine/fly.toml --build-only --push
// 2. Update: supabase secrets set DOCKER_IMAGE=<new-deployment-tag>
const dockerImage = Deno.env.get('DOCKER_IMAGE') || 'registry.fly.io/vyx-app:deployment-01K6NZMSHC7PQH57EMZN1R8CZG';
```

### 2. Create Deployment Script
Create `server/fly-machine/scripts/deploy-cloud-machine.sh`:

```bash
#!/bin/bash
# Deploy new cloud machine image and update Supabase to use it

set -e

echo "🚀 Building new cloud machine image..."

# Build and get deployment tag
IMAGE=$(fly deploy -a vyx-app -c server/fly-machine/fly.toml --build-only --push 2>&1 | grep "^image:" | awk '{print $2}')

if [ -z "$IMAGE" ]; then
  echo "❌ Failed to extract image tag from build output"
  exit 1
fi

echo "✅ Built image: $IMAGE"
echo ""

# Update Supabase secret
echo "📝 Updating Supabase DOCKER_IMAGE secret..."
supabase secrets set DOCKER_IMAGE=$IMAGE

echo ""
echo "✅ Deployment complete!"
echo "🎯 Image configured: $IMAGE"
echo ""
echo "Next steps:"
echo "1. Test by clicking 'Start Machine' in the UI"
echo "2. Monitor logs: fly logs -a vyx-app -f"
echo "3. Verify machine starts successfully"
```

Make it executable:
```bash
chmod +x server/fly-machine/scripts/deploy-cloud-machine.sh
```

### 3. Add Monitoring
Log the actual image being used in machine startup.

In `server/fly-machine/index.ts`:
```typescript
console.log('[Main] Configuration:');
console.log(`  User ID: ${config.userId}`);
console.log(`  Machine ID: ${config.machineId}`);
console.log(`  Image Timestamp: ${process.env.IMAGE_TIMESTAMP || 'unknown'}`); // ← Add this
console.log(`  Region: ${config.region}`);
```

This will show in logs and confirm which image version is running.

## Root Cause Summary

### Why it took 2 days:

1. **Assumed `:latest` worked** - didn't realize it was a stale pointer
2. **Didn't know about DOCKER_IMAGE secret** - thought fly.toml controlled it
3. **Build path issue was hidden** - image built successfully but had wrong file structure
4. **Auto-destroy masked errors** - machines disappeared before we could debug

### The fix:

**Always use deployment tags + update DOCKER_IMAGE secret + verify build structure**

## Quick Reference: Update Cloud Machine Image

```bash
# 1. Build new image
fly deploy -a vyx-app -c server/fly-machine/fly.toml --build-only --push

# 2. Copy the deployment tag from output
# Example: registry.fly.io/vyx-app:deployment-01K6PSH90XY4M9T7JN7QTSXDEH

# 3. Update Supabase secret
supabase secrets set DOCKER_IMAGE=registry.fly.io/vyx-app:deployment-<TAG>

# 4. Test in UI
# Click "Start Machine" and verify it works

# 5. Monitor
fly logs -a vyx-app -f
```

## Related Files

- `supabase/functions/provision-machine/index.ts` - Where DOCKER_IMAGE is used (line 197)
- `Dockerfile.fly-machine` - Multi-stage build with COPY paths
- `server/fly-machine/fly.toml` - Fly configuration (NOT used for UI-provisioned machines)
- `server/fly-machine/tsconfig.json` - TypeScript output directory config

## Future Improvements

1. **Automated deployment script** - One command to build + update secret
2. **Image tag validation** - Verify DOCKER_IMAGE secret points to valid image before provisioning
3. **Startup logging** - Log exact image digest on machine startup
4. **Deployment docs** - Document this process in main README
5. **CI/CD integration** - Automate the build + secret update on main branch commits
