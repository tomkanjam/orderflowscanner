# Redis Usage Optimization Summary

## Current Configuration
- **Symbols**: 3 (BTCUSDT, ETHUSDT, BNBUSDT)
- **Intervals**: 4 (1m, 5m, 15m, 1h)
- **Ticker Throttle**: 5 seconds per symbol
- **Kline Storage**: Only closed candles

## Redis Command Breakdown

### Per Symbol Commands
| Data Type | Frequency | Commands | Daily Total |
|-----------|-----------|----------|-------------|
| **Ticker Updates** | 1 per 5 seconds | 2 commands (setex + set) | 34,560 |
| **1m Klines** | 1 per minute | 3 commands (zadd + zrem + expire) | 4,320 |
| **5m Klines** | 1 per 5 minutes | 3 commands | 864 |
| **15m Klines** | 1 per 15 minutes | 3 commands | 288 |
| **1h Klines** | 1 per hour | 3 commands | 72 |
| **Total per Symbol** | - | - | **40,104** |

### Total Daily Usage
- **3 Symbols × 40,104 = 120,312 commands/day**
- **Free Tier Limit: 500,000 commands/day**
- **Usage: 24% of limit** ✅

## Optimization Impact

### Before Optimization
- Writing every WebSocket update
- ~5,110 commands/second
- **441,504,000 commands/day**
- Would exhaust free tier in **98 seconds**

### After Optimization
- Writing only closed candles + throttled tickers
- ~1.39 commands/second
- **120,312 commands/day**
- **99.97% reduction** 🎉

## Headroom for Growth

With current optimization, we can support:
- **Up to 12 symbols** at current update rates
- **Or up to 100 symbols** with 30-second ticker updates
- **Or mixed approach**: 20 symbols with 10-second ticker updates

## Key Optimizations Applied

1. **Candle Close Filter**: Only store completed candles (99% reduction)
2. **Ticker Throttling**: Update every 5 seconds instead of continuously (80% reduction)
3. **Pipeline Batching**: Group Redis commands for efficiency
4. **TTL Management**: Automatic expiry prevents unbounded growth

## Monitoring

Check Redis usage:
```bash
# Local verification
node verify-redis-usage.js

# Production logs
fly logs -a vyx-data-collector

# Health check
curl https://vyx-data-collector.fly.dev/health
```

## Cost Analysis

- **Free Tier**: 500k commands/day = $0/month
- **Current Usage**: 120k commands/day (24% of limit)
- **Safety Margin**: 380k commands/day available
- **Estimated Monthly Cost**: **$0** ✅