# Vyx Fly Machine - Cloud Execution Engine

Dedicated cloud infrastructure for Elite tier users, providing 24/7 signal detection and AI-powered analysis on Fly.io.

> **PRODUCTION READY** - Use `Dockerfile.prod` and deployment scripts in `scripts/` directory.

## Architecture

The Fly machine replicates the browser's web worker screening functionality in a dedicated cloud environment:

```
Browser (Elite User) ←WebSocket→ Fly Machine
                                      ↓
                    ┌──────────────────────────────────┐
                    │  Orchestrator                    │
                    │    ├─ BinanceWebSocketClient     │
                    │    ├─ ParallelScreener           │
                    │    ├─ ConcurrentAnalyzer         │
                    │    ├─ StateSynchronizer          │
                    │    ├─ DynamicScaler              │
                    │    ├─ HealthMonitor              │
                    │    └─ WebSocketServer            │
                    └──────────────────────────────────┘
                                      ↓
                                  Supabase
```

## Services

1. **BinanceWebSocketClient**: Streams real-time market data from Binance
2. **ParallelScreener**: Executes trader filters in parallel using worker threads
3. **ConcurrentAnalyzer**: Queues and executes AI analysis with Gemini
4. **StateSynchronizer**: Batch writes signals and metrics to Supabase
5. **DynamicScaler**: Scales vCPUs (1-8) based on workload
6. **HealthMonitor**: Tracks system health and component status
7. **WebSocketServer**: Real-time communication with browser
8. **Orchestrator**: Coordinates all services and manages lifecycle

## Development

### Prerequisites

- Node.js 18+
- pnpm 8+
- Supabase project with service role key

### Setup

```bash
# Install dependencies
pnpm install

# Build TypeScript
pnpm build

# Run locally (requires environment variables)
pnpm start
```

### Environment Variables

Required:
- `USER_ID`: The Elite user's ID
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_KEY`: Supabase service role key

Optional:
- `MACHINE_ID`: Unique machine identifier (auto-generated if not set)
- `MACHINE_REGION`: Region (sin/iad/fra, defaults to sin)
- `MACHINE_CPUS`: Initial vCPU count (default: 1)
- `MACHINE_MEMORY`: Memory in MB (default: 256)
- `KLINE_INTERVAL`: Kline interval (1m/5m/15m/1h, default: 5m)
- `SCREENING_INTERVAL_MS`: Screening interval in ms (default: 60000)

## 🚀 Quick Deployment

### Prerequisites

1. **Fly.io CLI** installed:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Docker** installed and running

3. **Environment Variables** in project root `.env.local`:
   ```bash
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   GEMINI_API_KEY=your-gemini-api-key
   ```

### Deployment Steps

#### 1. Login to Fly.io
```bash
fly auth login
```

#### 2. Set Secrets (First Time Only)
```bash
./scripts/setup-secrets.sh
```

This will set:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`

#### 3. Deploy
```bash
./scripts/deploy.sh
```

Deploys to `vyx-app` (configure via `FLY_APP_NAME` environment variable).

#### 4. Verify
```bash
fly status --app vyx-app
fly logs --app vyx-app
```

### Local Testing

Test Docker image locally before deploying:

```bash
# Build image
./scripts/build.sh

# Test locally (requires .env.local)
./scripts/test-local.sh
```

Health check: http://localhost:8080/health

### Scaling

The machine automatically scales vCPUs (1-8) based on workload via the DynamicScaler service. Manual scaling is also possible:

```bash
# Scale to 4 vCPUs
flyctl scale vm shared-cpu-4x

# View current scaling
flyctl scale show
```

### Monitoring

```bash
# View logs
flyctl logs

# View metrics
flyctl metrics

# SSH into machine
flyctl ssh console

# Check health
flyctl checks list
```

## Machine Provisioning

For provisioning machines for Elite users, use the Machine Provisioning API:

```typescript
// Provision new machine for Elite user
const machine = await provisionMachine({
  userId: 'user_123',
  region: 'sin',
  cpus: 1
});

// Machine will auto-start and connect to Supabase
// Browser can connect via WebSocket: wss://{machine.websocketUrl}
```

## Performance

### Resource Usage

- **Idle**: ~50MB RAM, minimal CPU
- **Light load** (5 traders, 50 symbols): ~100MB RAM, 10-20% CPU
- **Heavy load** (20 traders, 100 symbols): ~200MB RAM, 40-60% CPU
- **Peak load** (auto-scales to 8 vCPUs): ~500MB RAM, 80% CPU

### Cost Optimization

- Machines scale down during idle periods
- Batch writes reduce database load
- Concurrent AI analysis maximizes throughput
- Smart symbol filtering reduces unnecessary checks

### Expected Costs

- **Idle/Light**: ~$3-5/month (1 vCPU)
- **Moderate**: ~$8-12/month (2-4 vCPUs average)
- **Heavy**: ~$15-20/month (4-8 vCPUs average)

## Troubleshooting

### Machine won't start

Check logs for environment variable errors:
```bash
flyctl logs
```

### WebSocket disconnections

Verify health checks are passing:
```bash
flyctl checks list
```

### High memory usage

Check for memory leaks in logs, restart machine:
```bash
flyctl machine restart
```

### Slow screening

Machine may need more vCPUs (will auto-scale if enabled):
```bash
flyctl scale vm shared-cpu-4x
```

## Development

### Local Testing

```bash
# Set environment variables in .env
export USER_ID="user_test"
export SUPABASE_URL="http://localhost:54321"
export SUPABASE_SERVICE_KEY="test_key"

# Run with tsx for hot reload
pnpm dev
```

### Building Docker Image

```bash
# Build locally
docker build -t vyx-screener .

# Run locally
docker run -p 8080:8080 \
  -e USER_ID="user_test" \
  -e SUPABASE_URL="http://host.docker.internal:54321" \
  -e SUPABASE_SERVICE_KEY="test_key" \
  vyx-screener
```

## Architecture Decisions

### Why Node.js Worker Threads?

- Familiar environment (reuses browser web worker code)
- True parallelism for CPU-bound filter execution
- Shared memory for efficient market data access
- Easy scaling (1-8 workers based on vCPU count)

### Why Batch Writes?

- Reduces Supabase connection overhead
- Improves write throughput (10x faster)
- Prevents rate limiting during high signal volume
- Maintains data consistency with transaction batching

### Why Dynamic Scaling?

- Cost optimization (scale down during idle periods)
- Performance optimization (scale up during volatility)
- Prevents resource exhaustion
- Automatic with cooldown to prevent thrashing

## License

MIT
