# Deployment Guide - VYX Go Screener

This guide covers deploying the VYX Go Screener backend to Fly.io.

## Prerequisites

1. **Fly.io Account**: Sign up at [fly.io](https://fly.io)
2. **Fly CLI**: Install the Fly CLI tool
3. **Supabase Account**: You'll need Supabase credentials
4. **Docker** (optional): For local testing

## Step 1: Install Fly CLI

### macOS/Linux
```bash
curl -L https://fly.io/install.sh | sh
```

### Windows
```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

Verify installation:
```bash
fly version
```

## Step 2: Login to Fly.io

```bash
fly auth login
```

This will open your browser for authentication.

## Step 3: Create Fly.io App

From the `backend/go-screener` directory:

```bash
# Create the app
fly apps create vyx-go-screener

# Or use a custom name
fly apps create your-custom-name
```

**Note**: App names must be globally unique across Fly.io.

## Step 4: Configure Secrets

Set your Supabase credentials as secrets (these won't be logged):

```bash
fly secrets set \
  SUPABASE_URL="https://your-project.supabase.co" \
  SUPABASE_SERVICE_KEY="your-service-key-here" \
  SUPABASE_ANON_KEY="your-anon-key-here"
```

Verify secrets are set:
```bash
fly secrets list
```

## Step 5: Review fly.toml

The `fly.toml` file is pre-configured. Review and adjust if needed:

```toml
app = "vyx-go-screener"  # Your app name
primary_region = "sin"   # Singapore (change if needed)

# Available regions:
# sin - Singapore
# iad - Washington DC
# fra - Frankfurt
# lhr - London
# syd - Sydney
# nrt - Tokyo
```

## Step 6: Deploy

Deploy the application:

```bash
fly deploy
```

This will:
1. Build the Docker image
2. Push it to Fly's registry
3. Create and start your machine
4. Run health checks

**First deployment typically takes 2-5 minutes.**

## Step 7: Verify Deployment

Check the app status:
```bash
fly status
```

View logs:
```bash
fly logs
```

Test the health endpoint:
```bash
curl https://vyx-go-screener.fly.dev/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-10T12:00:00Z",
  "version": "1.0.0",
  "uptime": 30.5
}
```

## Step 8: Configure Scaling (Optional)

### Auto-scaling
The default `fly.toml` has auto-scaling configured:
- `min_machines_running = 0` - Scales to zero when idle
- `auto_stop_machines = "stop"` - Stops when no requests
- `auto_start_machines = true` - Starts on new requests

### Manual scaling
To keep machines always running:
```bash
fly scale count 1
```

To scale up:
```bash
fly scale count 3
```

### Memory/CPU scaling
```bash
# Scale to 1GB RAM
fly scale memory 1024

# Scale to 2 CPUs
fly scale vm shared-cpu-2x
```

## Monitoring & Maintenance

### View Logs
```bash
# Real-time logs
fly logs -f

# Last 100 lines
fly logs -n 100

# Filter by instance
fly logs -i machine-id
```

### SSH into Machine
```bash
fly ssh console
```

### Check Machine Status
```bash
fly machine list
```

### Restart Machine
```bash
fly machine restart machine-id
```

## Updating the Application

### Deploy New Version
```bash
# Make your changes
git add .
git commit -m "Update backend"

# Deploy
fly deploy
```

### Rollback
```bash
# List releases
fly releases

# Rollback to previous
fly releases rollback
```

## Environment-Specific Deployments

### Production
```bash
fly deploy --app vyx-go-screener-prod
```

### Staging
```bash
fly deploy --app vyx-go-screener-staging
```

## Troubleshooting

### Common Issues

#### 1. Build Fails
```bash
# Check Docker build locally first
docker build -t test .
```

#### 2. Health Checks Failing
```bash
# Check logs
fly logs

# Common causes:
# - Wrong PORT (must be 8080)
# - Supabase credentials invalid
# - Missing required env vars
```

#### 3. "Out of Memory"
```bash
# Scale up memory
fly scale memory 512
```

#### 4. "Connection Refused"
```bash
# Check if app is running
fly status

# Restart if needed
fly machine restart
```

#### 5. Secrets Not Working
```bash
# List secrets
fly secrets list

# Unset and reset
fly secrets unset SUPABASE_URL
fly secrets set SUPABASE_URL="https://..."
```

### Debug Mode

Enable verbose logging:
```bash
fly deploy --verbose
```

## Cost Optimization

### Free Tier
Fly.io free tier includes:
- 3 shared-cpu-1x machines (256MB RAM each)
- 160GB bandwidth/month
- Auto-scaling to zero

### Cost Savings Tips
1. **Use auto-scaling**: Scale to zero when idle
2. **Right-size machines**: Start with 256MB RAM
3. **Use shared CPUs**: Cheaper than dedicated
4. **Monitor usage**: Check `fly dashboard`

### Estimated Costs (beyond free tier)
- Shared-CPU-1x (256MB): ~$2/month
- Shared-CPU-2x (512MB): ~$4/month
- Dedicated-CPU-1x (2GB): ~$30/month

## Advanced Configuration

### Custom Domains
```bash
# Add custom domain
fly certs add api.yourdomain.com

# Verify DNS
fly certs show api.yourdomain.com
```

### Multiple Regions
```bash
# Add region
fly regions add fra

# Remove region
fly regions remove fra

# List regions
fly regions list
```

### Persistent Storage (if needed)
```bash
# Create volume
fly volumes create data --size 1

# Update fly.toml to mount
# [mounts]
#   source = "data"
#   destination = "/data"
```

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Fly.io

on:
  push:
    branches: [main]
    paths:
      - 'backend/go-screener/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: superfly/flyctl-actions/setup-flyctl@master

      - name: Deploy to Fly.io
        run: |
          cd backend/go-screener
          flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

Get your API token:
```bash
fly auth token
```

Add it to GitHub Secrets as `FLY_API_TOKEN`.

## Security Best Practices

1. **Use Secrets**: Never commit credentials
2. **Rotate Keys**: Regularly rotate Supabase keys
3. **Monitor Logs**: Watch for suspicious activity
4. **Update Dependencies**: Keep Go modules updated
5. **HTTPS Only**: Fly.io provides free SSL certificates

## Performance Tuning

### Optimize Response Times
1. **Regional deployment**: Deploy close to users
2. **Connection pooling**: Reuse HTTP connections
3. **Caching**: Implement Redis if needed
4. **Database indexes**: Optimize Supabase queries

### Monitor Performance
```bash
# Check response times
fly logs | grep "request completed"

# View metrics
fly dashboard
```

## Support

- **Fly.io Docs**: https://fly.io/docs
- **Community**: https://community.fly.io
- **Status**: https://status.fly.io

## Cleanup

To delete the app:
```bash
fly apps destroy vyx-go-screener
```

**WARNING**: This is permanent and will delete all data!

---

## Quick Reference

```bash
# Deploy
fly deploy

# View logs
fly logs -f

# Check status
fly status

# SSH into machine
fly ssh console

# Scale
fly scale memory 512
fly scale count 2

# Secrets
fly secrets set KEY=value
fly secrets list

# Rollback
fly releases rollback
```

---

Last updated: 2025-10-10
