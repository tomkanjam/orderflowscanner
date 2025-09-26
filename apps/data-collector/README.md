# Data Collector Service

Centralized WebSocket data collection service for Binance market data.

## Architecture

This service:
1. Connects to Binance WebSocket streams for multiple symbols
2. Receives real-time ticker and kline (candlestick) data
3. Writes data to Upstash Redis with pipelining for efficiency
4. Provides health check endpoint for monitoring

## Setup

1. **Create Upstash Redis Database**:
   - Go to [Upstash Console](https://console.upstash.com/)
   - Create new Redis database
   - Choose a region close to your deployment
   - Copy the REST URL and Token

2. **Configure Environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your Upstash credentials
   ```

3. **Install Dependencies**:
   ```bash
   pnpm install
   ```

4. **Run Development**:
   ```bash
   pnpm dev
   ```

## Deployment

This service is designed to run on Fly.io:

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login to Fly
fly auth login

# Create app
fly apps create ai-crypto-data-collector

# Set secrets
fly secrets set UPSTASH_REDIS_URL="your-url" UPSTASH_REDIS_TOKEN="your-token"

# Deploy
fly deploy
```

## Health Check

```bash
curl http://localhost:3001/health
```

## Data Storage

- **Tickers**: Stored with 60s TTL, constantly refreshed
- **Klines**: Last 500 candles per interval, 24h TTL
- **Keys**:
  - `ticker:{symbol}` - Current ticker data
  - `klines:{symbol}:{interval}` - Sorted set of klines
  - `lastClosed:{symbol}:{interval}` - Last closed candle timestamp

## Performance

- WebSocket handles up to 1024 streams per connection
- Redis pipelining flushes every 100ms
- Target latency: <5ms for Redis writes
- Reconnection on disconnect with 5s delay