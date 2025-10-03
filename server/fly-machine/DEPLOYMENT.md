# Vyx Fly Machine - Deployment Guide

Complete step-by-step guide to deploy the cloud execution infrastructure for Elite tier users.

## 📋 Pre-Deployment Checklist

- [ ] Fly.io account created (https://fly.io)
- [ ] Fly CLI installed (`curl -L https://fly.io/install.sh | sh`)
- [ ] Docker Desktop installed and running
- [ ] Supabase project set up with Elite tier users
- [ ] Google Gemini API key obtained (optional, for AI analysis)
- [ ] All database migrations applied (check `supabase/migrations/`)

## 🎯 Deployment Steps

### Step 1: Authenticate with Fly.io

```bash
fly auth login
```

This opens a browser window for authentication.

### Step 2: Set Environment Variables

Create `.env.local` in the **project root** (not in server/fly-machine):

```bash
# File: /path/to/project/.env.local

SUPABASE_URL=https://jtpqkbybuxbcvqeffmtf.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...  # Service role key (not anon key!)
GEMINI_API_KEY=AI...  # Google Gemini API key
```

**Important**: Use the **service role key**, not the anon key!

### Step 3: Navigate to Fly Machine Directory

```bash
cd server/fly-machine
```

### Step 4: Set Fly.io Secrets

```bash
./scripts/setup-secrets.sh
```

This script will:
1. Read from `.env.local`
2. Prompt for confirmation
3. Set secrets in Fly.io app `vyx-app`

**Manual alternative**:
```bash
fly secrets set \
  --app vyx-app \
  SUPABASE_URL="https://..." \
  SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
  GEMINI_API_KEY="AI..."
```

### Step 5: Deploy to Fly.io

```bash
./scripts/deploy.sh
```

This will:
1. Build Docker image using `Dockerfile.prod`
2. Push to Fly.io registry
3. Deploy to `vyx-app`
4. Run health checks

**Expected output**:
```
✅ Deployment successful!

App status:
  Name:     vyx-app
  Status:   running
  Region:   sjc
  ...
```

### Step 6: Verify Deployment

```bash
# Check status
fly status --app vyx-app

# View logs
fly logs --app vyx-app

# List machines
fly machines list --app vyx-app
```

### Step 7: Test Cloud Execution

1. Log in to your app as an Elite user
2. Navigate to Cloud Execution panel
3. Click "Start Machine"
4. Monitor logs for startup:
   ```bash
   fly logs -f --app vyx-app
   ```

Expected log output:
```
[Main] Configuration:
  User ID: <user-id>
  Machine ID: vyx-<short-id>
  Region: sjc
  CPUs: 1
  Memory: 256 MB

[Orchestrator] Starting...
[BinanceWS] Connecting to 100 symbols...
[BinanceWS] Connected successfully
[Orchestrator] Started successfully
Machine is running! Press Ctrl+C to stop.
```

## 🔍 Troubleshooting

### Issue: Secrets not set

**Error**: `Missing required environment variables`

**Solution**:
```bash
fly secrets list --app vyx-app
```

If empty, run `./scripts/setup-secrets.sh` again.

### Issue: Docker build fails

**Error**: `failed to solve with frontend dockerfile.v0`

**Solution**: Make sure you're in the correct directory:
```bash
cd server/fly-machine
./scripts/build.sh --no-cache
```

### Issue: Machine won't start

**Error**: Machine status shows `stopped` or `error`

**Solution**: Check logs for errors:
```bash
fly logs --app vyx-app | grep ERROR
```

Common issues:
- Missing `SUPABASE_SERVICE_ROLE_KEY`
- Invalid Supabase URL
- Network connectivity to Binance

### Issue: Health check failing

**Error**: `Health check failed`

**Check**:
```bash
fly ssh console --app vyx-app
# Inside container:
curl http://localhost:8080/health
```

Should return `OK`. If not, check if the app is running:
```bash
ps aux | grep node
```

### Issue: TypeScript compilation errors

**Error**: `error TS2307: Cannot find module`

**Solution**: Rebuild shared dependencies:
```bash
# In server/fly-machine
npm install
npm run build
```

## 🔧 Local Testing

Before deploying, test the Docker image locally:

### Build Image

```bash
./scripts/build.sh
```

### Run Locally

```bash
./scripts/test-local.sh
```

This runs the container with:
- Port 8080 exposed (health check)
- Port 8081 exposed (WebSocket)
- Environment variables from `.env.local`

### Test Health Check

```bash
curl http://localhost:8080/health
```

Expected response: `OK`

### View Logs

```bash
docker logs -f vyx-fly-machine-test
```

### Stop Container

```bash
docker stop vyx-fly-machine-test
docker rm vyx-fly-machine-test
```

## 📊 Monitoring

### View Real-time Logs

```bash
fly logs -f --app vyx-app
```

### Check Machine Status

```bash
fly status --app vyx-app
```

### SSH into Container

```bash
fly ssh console --app vyx-app
```

### View Metrics (TODO)

```bash
curl https://vyx-app.fly.dev/metrics
```

## 🔄 Updates & Rollbacks

### Deploy Update

```bash
./scripts/deploy.sh
```

Fly.io automatically creates a new version and health-checks before routing traffic.

### Rollback to Previous Version

```bash
fly releases --app vyx-app
fly deploy --app vyx-app --image <previous-image>
```

### Force Restart

```bash
fly apps restart vyx-app
```

## 💰 Cost Management

### Check Current Usage

```bash
fly scale show --app vyx-app
```

### Estimated Costs

- **1 vCPU, 256MB**: ~$3-5/month
- **2 vCPU, 512MB**: ~$8-12/month
- **4 vCPU, 1GB**: ~$15-20/month
- **8 vCPU, 2GB**: ~$30-40/month (max)

The machine auto-scales based on load (1-8 vCPUs).

### Set Cost Alerts

Configure in Fly.io dashboard: https://fly.io/dashboard/<org>/billing

## 🚨 Emergency Procedures

### Machine Unresponsive

```bash
# Force restart
fly apps restart vyx-app

# If still unresponsive, destroy and redeploy
fly apps destroy vyx-app
./scripts/deploy.sh
```

### Database Connection Issues

```bash
# SSH into container
fly ssh console --app vyx-app

# Test Supabase connection
node -e "
const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
client.from('traders').select('count').then(console.log).catch(console.error);
"
```

### Binance WebSocket Issues

Check Binance API status: https://www.binance.com/en/support/announcement

Verify connection from container:
```bash
fly ssh console --app vyx-app
curl -I https://api.binance.com/api/v3/ping
```

## 📖 Additional Resources

- [Fly.io Documentation](https://fly.io/docs/)
- [Fly.io Machines API](https://fly.io/docs/machines/)
- [Docker Multi-Stage Builds](https://docs.docker.com/build/building/multi-stage/)
- [Binance API Docs](https://binance-docs.github.io/apidocs/spot/en/)
- [Supabase Service Role](https://supabase.com/docs/guides/api/api-keys)

## ✅ Post-Deployment Checklist

- [ ] Machine status shows `running`
- [ ] Health checks passing
- [ ] Logs show successful Binance connection
- [ ] Test signal creation from UI
- [ ] Verify signals written to Supabase
- [ ] Monitor costs in Fly.io dashboard
- [ ] Set up alerting (optional)

## 🎉 Success!

Your Fly machine is now running 24/7, providing cloud execution for Elite tier users!

**Next Steps:**
1. Monitor logs for first few hours
2. Test with real Elite user
3. Verify auto-scaling behavior
4. Set up monitoring/alerting

For support, check the main README.md or open an issue on GitHub.
