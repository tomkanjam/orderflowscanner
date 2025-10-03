# Fly.io Grafana Metrics for Trader & Kline Activity 📊

**Date:** 2025-10-03
**Question:** Can we visualize machine trader and kline activity in Fly.io's Grafana?
**Answer:** Yes! Here's how it works and what you'd need to add.

---

## What Fly.io Provides Out of the Box

### 1. Managed Grafana Instance
- **URL:** https://fly-metrics.net
- **Authentication:** Uses your Fly.io credentials
- **Pre-configured:** Automatically connected to your Prometheus data source
- **Built-in Dashboards:** Infrastructure metrics (CPU, memory, network, etc.)

### 2. Automatic Infrastructure Metrics
Fly.io automatically collects and exposes:
- **System metrics:** CPU usage, memory, disk I/O
- **Network metrics:** Requests per second, bandwidth, latency
- **Machine health:** Status, restarts, crashes

### 3. Custom Application Metrics Support
Fly.io can scrape **custom metrics** from your app if you:
1. Expose metrics in **Prometheus format** on an HTTP endpoint
2. Configure the endpoint in `fly.toml`
3. Fly scrapes every **15 seconds** automatically

---

## What We DON'T Have Yet (Custom Metrics)

To visualize **trader and kline activity**, we'd need to add custom application metrics for:

### Trading Activity Metrics
```
# Trader execution metrics
trader_screenings_total{trader_id, trader_name}        # Counter: screenings per trader
trader_matches_total{trader_id, trader_name}           # Counter: total matches
trader_signals_total{trader_id, trader_name}           # Counter: signals created
trader_new_matches{trader_id, trader_name}             # Gauge: current NEW matches
trader_continuing_matches{trader_id, trader_name}      # Gauge: ongoing matches
trader_execution_time_ms{trader_id, trader_name}       # Histogram: filter runtime
trader_symbols_watching{trader_id}                     # Gauge: symbols monitored

# Signal lifecycle metrics
signals_pending_analysis                                # Gauge: queue depth
signals_analyzed_total                                  # Counter: completed analyses
signals_failed_total                                    # Counter: failed analyses

# WebSocket health metrics
binance_ws_connected{status}                            # Gauge: connection state
binance_ws_reconnects_total                             # Counter: reconnection attempts
binance_ws_messages_total{type}                         # Counter: ticker/kline messages
binance_ws_latency_ms                                   # Histogram: message latency
```

### Kline (Candlestick) Data Metrics
```
# Market data freshness
kline_last_update_timestamp{symbol, interval}           # Gauge: last candle received
kline_data_age_seconds{symbol, interval}                # Gauge: staleness check
kline_updates_total{symbol, interval}                   # Counter: total updates
kline_buffer_size{symbol, interval}                     # Gauge: candles in memory

# Data quality metrics
kline_missing_data_total{symbol, interval}              # Counter: gaps detected
kline_parse_errors_total{symbol}                        # Counter: malformed data
binance_ticker_updates_total{symbol}                    # Counter: price updates
```

### System Performance Metrics
```
# Worker thread performance
screener_workers_active                                  # Gauge: busy workers
screener_workers_idle                                    # Gauge: available workers
screener_queue_depth                                     # Gauge: pending tasks
screener_task_duration_ms{worker_id}                     # Histogram: task time

# State synchronizer metrics
sync_queue_depth{queue_type}                             # Gauge: signals/metrics/events queued
sync_batch_writes_total                                  # Counter: DB write batches
sync_write_errors_total                                  # Counter: failed writes
sync_write_duration_ms                                   # Histogram: batch write time
```

---

## How It Would Work

### 1. Add Prometheus Exporter to Your App

**Install Prometheus client library:**
```bash
cd server/fly-machine
npm install prom-client
```

**Create metrics service:**
```typescript
// server/fly-machine/services/MetricsExporter.ts
import { Registry, Counter, Gauge, Histogram } from 'prom-client';

export class MetricsExporter {
  private registry: Registry;

  // Define metrics
  private traderScreeningsTotal: Counter;
  private traderSignalsTotal: Counter;
  private traderNewMatches: Gauge;
  private traderContinuingMatches: Gauge;
  private klineLastUpdate: Gauge;
  private binanceWsConnected: Gauge;
  // ... etc

  constructor() {
    this.registry = new Registry();

    // Initialize all metrics
    this.traderScreeningsTotal = new Counter({
      name: 'trader_screenings_total',
      help: 'Total number of screenings executed per trader',
      labelNames: ['trader_id', 'trader_name'],
      registers: [this.registry]
    });

    this.traderSignalsTotal = new Counter({
      name: 'trader_signals_total',
      help: 'Total signals created per trader',
      labelNames: ['trader_id', 'trader_name'],
      registers: [this.registry]
    });

    // ... initialize others
  }

  // Methods to record metrics
  recordScreening(traderId: string, traderName: string) {
    this.traderScreeningsTotal.inc({ trader_id: traderId, trader_name: traderName });
  }

  recordSignal(traderId: string, traderName: string) {
    this.traderSignalsTotal.inc({ trader_id: traderId, trader_name: traderName });
  }

  setTraderMatches(traderId: string, traderName: string, newMatches: number, continuing: number) {
    this.traderNewMatches.set({ trader_id: traderId, trader_name: traderName }, newMatches);
    this.traderContinuingMatches.set({ trader_id: traderId, trader_name: traderName }, continuing);
  }

  updateKlineTimestamp(symbol: string, interval: string, timestamp: number) {
    this.klineLastUpdate.set({ symbol, interval }, timestamp);
  }

  // HTTP endpoint for Prometheus scraping
  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
```

### 2. Add HTTP Server for Metrics Endpoint

**In your main index.ts:**
```typescript
import express from 'express';
import { MetricsExporter } from './services/MetricsExporter';

const metricsExporter = new MetricsExporter();
const metricsApp = express();

// Expose metrics on /metrics endpoint
metricsApp.get('/metrics', async (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(await metricsExporter.getMetrics());
});

// Start metrics server on port 9091
metricsApp.listen(9091, '0.0.0.0', () => {
  console.log('[Metrics] Prometheus exporter listening on :9091/metrics');
});
```

### 3. Instrument Your Code

**In Orchestrator.ts:**
```typescript
private async runScreening(): Promise<void> {
  // ... existing code ...

  // Record metrics
  for (const [traderId, result] of results.entries()) {
    metricsExporter.recordScreening(result.traderId, result.traderName);

    const newSignals = result.matches.length;
    const continuingMatches = result.continuingMatches || 0;

    metricsExporter.setTraderMatches(
      result.traderId,
      result.traderName,
      newSignals,
      continuingMatches
    );

    for (const match of result.matches) {
      metricsExporter.recordSignal(result.traderId, result.traderName);
    }
  }
}
```

**In BinanceWebSocketClient.ts:**
```typescript
private handleKlineUpdate(data: any): void {
  const kline = data.k;
  const symbol = kline.s;
  const interval = kline.i;

  // ... existing code ...

  // Record metric
  metricsExporter.updateKlineTimestamp(symbol, interval, kline.t);
  metricsExporter.recordKlineUpdate(symbol, interval);
}

ws.on('open', () => {
  metricsExporter.setBinanceWsConnected(1);
});

ws.on('close', () => {
  metricsExporter.setBinanceWsConnected(0);
  metricsExporter.recordBinanceReconnect();
});
```

### 4. Configure fly.toml

**Add metrics section:**
```toml
[metrics]
port = 9091
path = "/metrics"
```

### 5. Deploy and Verify

**Deploy:**
```bash
cd server/fly-machine
./scripts/deploy.sh
```

**Test locally first:**
```bash
curl http://localhost:9091/metrics
```

**Expected output (Prometheus format):**
```
# HELP trader_screenings_total Total number of screenings executed per trader
# TYPE trader_screenings_total counter
trader_screenings_total{trader_id="abc123",trader_name="RSI Oversold"} 420

# HELP trader_signals_total Total signals created per trader
# TYPE trader_signals_total counter
trader_signals_total{trader_id="abc123",trader_name="RSI Oversold"} 5

# HELP trader_new_matches Current number of new matches for trader
# TYPE trader_new_matches gauge
trader_new_matches{trader_id="abc123",trader_name="RSI Oversold"} 0

# HELP trader_continuing_matches Current number of continuing matches
# TYPE trader_continuing_matches gauge
trader_continuing_matches{trader_id="abc123",trader_name="RSI Oversold"} 3

# HELP kline_last_update_timestamp Last kline update timestamp
# TYPE kline_last_update_timestamp gauge
kline_last_update_timestamp{symbol="BTCUSDT",interval="5m"} 1696348800000

# HELP binance_ws_connected WebSocket connection status (1=connected, 0=disconnected)
# TYPE binance_ws_connected gauge
binance_ws_connected{status="connected"} 1
```

---

## Visualizing in Grafana

### Access Grafana
1. Go to https://fly-metrics.net
2. Log in with Fly.io credentials
3. Navigate to your organization

### Create Custom Dashboard

**Example panels you could create:**

#### Panel 1: Trader Activity Heatmap
```promql
rate(trader_screenings_total[5m])
```
Shows which traders are most active

#### Panel 2: New Signals per Trader
```promql
increase(trader_signals_total[1h])
```
Bar chart showing signal generation by trader

#### Panel 3: Match Distribution
```promql
trader_new_matches + trader_continuing_matches
```
Stacked area chart showing total matches over time

#### Panel 4: Kline Data Freshness
```promql
time() - (kline_last_update_timestamp / 1000)
```
Shows how stale each symbol's data is

#### Panel 5: WebSocket Health
```promql
binance_ws_connected
```
Binary indicator: 1 = healthy, 0 = disconnected

#### Panel 6: Signal Processing Pipeline
```promql
signals_pending_analysis
```
Gauge showing backlog depth

#### Panel 7: Trader Execution Time
```promql
histogram_quantile(0.95, rate(trader_execution_time_ms_bucket[5m]))
```
P95 latency for filter execution

---

## Benefits of Adding Metrics

### 1. **Operational Visibility**
- See which traders are generating signals
- Identify underperforming or broken traders
- Monitor system health in real-time

### 2. **Performance Optimization**
- Find slow filters (execution time histograms)
- Identify bottlenecks (queue depths)
- Track resource usage per trader

### 3. **Data Quality Monitoring**
- Detect stale kline data
- Identify WebSocket disconnections
- Track missing candles or gaps

### 4. **Business Intelligence**
- Compare trader effectiveness
- Analyze signal generation patterns
- Optimize trading strategies based on data

### 5. **Alerting**
You could set up alerts for:
- WebSocket disconnected for > 1 minute
- No signals generated in last hour
- Queue depth exceeds threshold
- Trader execution time > 5 seconds

---

## Current State vs. With Metrics

### Current: Blind Operation
```
You see:
- Machine is running ✅
- 420 screenings executed ✅
- 0 signals generated ❌
- ??? WHY? No visibility
```

### With Metrics: Full Visibility
```
You see in Grafana:
- Trader "RSI Oversold": 3 symbols matching (0 new, 3 continuing)
- Trader "Momentum Break": 0 symbols matching
- BTCUSDT last kline: 10 seconds ago (fresh ✅)
- WebSocket: Connected (✅)
- Filter execution: avg 2ms, p95 5ms
- Queue depth: 0 (healthy ✅)
```

---

## Effort Estimate

### What You'd Need to Build
1. **MetricsExporter service** - 2-3 hours
   - Initialize Prometheus client
   - Define all metrics
   - Create HTTP endpoint

2. **Instrumentation** - 3-4 hours
   - Add metric recording to Orchestrator
   - Add metric recording to workers
   - Add metric recording to BinanceWS
   - Add metric recording to StateSynchronizer

3. **Configuration** - 30 minutes
   - Update fly.toml
   - Test metrics endpoint
   - Deploy

4. **Grafana dashboards** - 2-3 hours
   - Learn Grafana query language
   - Create panels
   - Arrange layout
   - Configure refresh rates

**Total:** ~8-10 hours to full implementation

---

## Alternative: Simple Logging (What We Just Added)

**Instead of full metrics**, we added enhanced logging:
```
[Worker] Trader "RSI Oversold": 3 symbols matching (0 new signals, 3 continuing)
```

**Pros:**
- ✅ No additional code complexity
- ✅ Immediate results
- ✅ Easy to understand
- ✅ No metrics infrastructure needed

**Cons:**
- ❌ Can't visualize trends over time
- ❌ No historical data
- ❌ Must watch logs manually
- ❌ No alerting capabilities

---

## Recommendation

### For Debugging (Now)
Use the enhanced logging we just added. It's perfect for:
- Understanding current behavior
- Identifying if traders are working
- Quick troubleshooting

### For Production (Later)
Add Prometheus metrics when you need:
- Historical trend analysis
- Performance optimization
- Business intelligence
- Automated alerting
- Multi-trader comparison

---

## Example Grafana Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Vyx Cloud Machine - Trader Activity Dashboard              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │ WebSocket Status │  │ Kline Freshness  │               │
│  │   🟢 Connected   │  │   BTCUSDT: 2s    │               │
│  │   Uptime: 4h     │  │   ETHUSDT: 3s    │               │
│  └──────────────────┘  └──────────────────┘               │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Signals Generated (Last Hour)                      │  │
│  │  ▓▓▓▓▓▓░░ RSI Oversold (15)                         │  │
│  │  ▓▓░░░░░░ Momentum Break (4)                        │  │
│  │  ▓▓▓░░░░░ Volume Spike (7)                          │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Trader Match Distribution                          │  │
│  │  [Stacked area chart showing new vs continuing]    │  │
│  │                                                     │  │
│  │      continuing matches ████████████████████       │  │
│  │      new signals        ▓▓░░░░▓▓░░░░▓▓           │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │ Queue Depth      │  │ Execution Time   │               │
│  │   Signals: 0     │  │   Avg: 2ms       │               │
│  │   Analysis: 0    │  │   P95: 5ms       │               │
│  └──────────────────┘  └──────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

---

## Summary

**Can we visualize in Grafana?**
✅ Yes! Fly.io provides managed Grafana with Prometheus scraping.

**What's needed?**
1. Add Prometheus client library to your app
2. Create metrics exporter service
3. Instrument your code (record metrics)
4. Configure `fly.toml` to expose metrics endpoint
5. Deploy and create Grafana dashboards

**Is it worth it?**
- **For debugging now:** No - use the logs we added
- **For production later:** Yes - gives operational visibility and alerting

**Current logs vs. metrics:**
- **Logs:** Point-in-time, text-based, good for debugging
- **Metrics:** Historical trends, visual dashboards, good for operations

**Next step:**
Check the new logs from your fresh machine to see if traders are matching!
