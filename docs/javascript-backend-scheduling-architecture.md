# JavaScript Backend Scheduling Architecture

## Executive Summary

This document outlines how to move the existing JavaScript trader execution from browser Web Workers to a scalable backend infrastructure, **keeping all existing JavaScript code** and focusing on solving the scheduling challenge at scale.

## Current Architecture Analysis

### How It Works Now (Browser-Based)

1. **Trader Storage**: Traders stored in Supabase with filter code (JavaScript)
2. **Execution**: 
   - Web Workers run trader filter code in browser
   - Two scheduling modes:
     - Shared interval: All traders run every 5 seconds
     - Individual intervals: Each trader has its own `refreshInterval` (1m, 5m, 15m, etc.)
3. **Data Flow**:
   - Real-time market data via WebSocket in browser
   - Historical klines fetched and cached locally
   - Worker executes filter against current market snapshot

### Current Limitations

- **Browser Dependency**: Stops when browser closes
- **Resource Intensive**: Limited by client CPU/memory
- **No Persistence**: Signals lost if browser crashes
- **Single User**: Can't share compute across users

## The Scheduling Challenge at Scale

### Core Problem
With 1000+ users each having 5-10 traders with different intervals:
- **10,000+ trader executions** to schedule
- **Different intervals**: 1m, 5m, 15m, 1h, 4h, 1d
- **Shared data**: Many traders analyze same symbols
- **Resource efficiency**: Can't run 10,000 separate processes

### Scheduling Requirements
1. **Interval Accuracy**: Traders must run at specified intervals
2. **Fair Resource Allocation**: Tier-based limits (Free: 3 traders, Pro: 10, Elite: unlimited)
3. **Data Efficiency**: Share market data across traders
4. **Horizontal Scalability**: Add more workers as load increases
5. **Fault Tolerance**: Handle worker failures gracefully

## Proposed Solution: Distributed Job Queue Architecture

### Architecture Overview

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Scheduler     │────▶│  Job Queue   │────▶│  Worker Pool    │
│   Service       │     │   (Redis)    │     │  (Node.js)      │
└─────────────────┘     └──────────────┘     └─────────────────┘
        │                                              │
        ▼                                              ▼
┌─────────────────┐                          ┌─────────────────┐
│    Supabase     │                          │  Market Data    │
│   (Traders)     │                          │    Service      │
└─────────────────┘                          └─────────────────┘
```

### Components

#### 1. Scheduler Service (Supabase Edge Function)
Runs every minute to queue jobs based on trader intervals:

```typescript
// supabase/functions/trader-scheduler/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Redis } from "https://deno.land/x/redis@v0.29.0/mod.ts";

const redis = new Redis({
  url: Deno.env.get("REDIS_URL")!,
});

serve(async (req) => {
  const currentMinute = new Date().getMinutes();
  const currentHour = new Date().getHours();
  
  // Get all active traders
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  
  const { data: traders } = await supabase
    .from("traders")
    .select("*")
    .eq("enabled", true);
  
  const jobs = [];
  
  for (const trader of traders || []) {
    const shouldRun = checkIfShouldRun(
      trader.filter.refreshInterval,
      currentMinute,
      currentHour
    );
    
    if (shouldRun) {
      // Group jobs by interval for batch processing
      const jobKey = `trader:${trader.filter.refreshInterval}`;
      
      jobs.push({
        id: crypto.randomUUID(),
        type: "EXECUTE_TRADER",
        traderId: trader.id,
        userId: trader.user_id,
        interval: trader.filter.refreshInterval,
        priority: getPriorityByTier(trader.access_tier),
        timestamp: Date.now(),
        filterCode: trader.filter.code,
        requiredTimeframes: trader.filter.requiredTimeframes,
      });
    }
  }
  
  // Batch enqueue jobs by interval for efficiency
  const jobsByInterval = groupBy(jobs, "interval");
  
  for (const [interval, intervalJobs] of Object.entries(jobsByInterval)) {
    // Use Redis sorted set for priority queue
    const pipeline = redis.pipeline();
    
    for (const job of intervalJobs) {
      // Higher priority = lower score (processes first)
      const score = Date.now() - job.priority * 1000000;
      pipeline.zadd(
        `queue:traders:${interval}`,
        score,
        JSON.stringify(job)
      );
    }
    
    await pipeline.flush();
  }
  
  return new Response(JSON.stringify({ 
    scheduled: jobs.length,
    byInterval: Object.fromEntries(
      Object.entries(jobsByInterval).map(([k, v]) => [k, v.length])
    )
  }));
});

function checkIfShouldRun(
  interval: string, 
  currentMinute: number, 
  currentHour: number
): boolean {
  switch (interval) {
    case "1m": return true; // Every minute
    case "5m": return currentMinute % 5 === 0;
    case "15m": return currentMinute % 15 === 0;
    case "30m": return currentMinute % 30 === 0;
    case "1h": return currentMinute === 0;
    case "4h": return currentMinute === 0 && currentHour % 4 === 0;
    case "1d": return currentMinute === 0 && currentHour === 0;
    default: return false;
  }
}

function getPriorityByTier(tier: string): number {
  switch (tier) {
    case "elite": return 3;
    case "pro": return 2;
    case "free": return 1;
    default: return 0;
  }
}
```

#### 2. Worker Pool Service (Node.js)

Multiple worker instances that process jobs from the queue:

```javascript
// backend/services/trader-worker/index.js
import { Redis } from 'ioredis';
import { Worker } from 'worker_threads';
import { MarketDataService } from './marketData.js';
import { createClient } from '@supabase/supabase-js';

class TraderWorkerPool {
  constructor(config) {
    this.redis = new Redis(process.env.REDIS_URL);
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    this.marketData = new MarketDataService();
    this.workerPool = [];
    this.maxWorkers = config.maxWorkers || 10;
    this.interval = config.interval; // Which interval queue to process
    
    // Metrics
    this.processing = new Map(); // Track active jobs
    this.completed = 0;
    this.failed = 0;
  }
  
  async start() {
    console.log(`Starting worker pool for ${this.interval} interval`);
    
    // Create worker threads
    for (let i = 0; i < this.maxWorkers; i++) {
      this.createWorker(i);
    }
    
    // Start processing queue
    this.processQueue();
  }
  
  createWorker(id) {
    // Reuse existing Web Worker code!
    const worker = new Worker('./traderWorker.js', {
      workerData: { workerId: id }
    });
    
    worker.on('message', (result) => {
      this.handleWorkerResult(result);
    });
    
    worker.on('error', (error) => {
      console.error(`Worker ${id} error:`, error);
      this.failed++;
      // Restart worker
      this.createWorker(id);
    });
    
    this.workerPool[id] = worker;
  }
  
  async processQueue() {
    while (true) {
      try {
        // Get batch of jobs from priority queue
        const jobs = await this.redis.zrange(
          `queue:traders:${this.interval}`,
          0,
          this.maxWorkers - this.processing.size - 1
        );
        
        if (jobs.length === 0) {
          // No jobs, wait a bit
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        
        // Process jobs in parallel
        const promises = jobs.map(async (jobStr) => {
          const job = JSON.parse(jobStr);
          
          // Check if already processing
          if (this.processing.has(job.traderId)) {
            return;
          }
          
          this.processing.set(job.traderId, job);
          
          // Remove from queue
          await this.redis.zrem(`queue:traders:${this.interval}`, jobStr);
          
          // Get market data (shared across traders)
          const marketSnapshot = await this.getMarketSnapshot(
            job.requiredTimeframes
          );
          
          // Find available worker
          const workerId = this.findAvailableWorker();
          if (workerId === -1) {
            // No workers available, requeue
            await this.requeueJob(job);
            this.processing.delete(job.traderId);
            return;
          }
          
          // Send to worker (reusing existing worker code!)
          this.workerPool[workerId].postMessage({
            id: job.id,
            type: 'RUN_TRADER_FILTER',
            data: {
              traderId: job.traderId,
              filterCode: job.filterCode,
              symbols: marketSnapshot.symbols,
              tickers: marketSnapshot.tickers,
              historicalData: marketSnapshot.historicalData
            }
          });
        });
        
        await Promise.all(promises);
        
      } catch (error) {
        console.error('Queue processing error:', error);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
  
  async getMarketSnapshot(requiredTimeframes) {
    // Cache market data by interval to share across traders
    const cacheKey = `market:${this.interval}:${Date.now() / 60000 | 0}`;
    
    let snapshot = await this.redis.get(cacheKey);
    if (snapshot) {
      return JSON.parse(snapshot);
    }
    
    // Fetch fresh data
    snapshot = await this.marketData.getSnapshot(requiredTimeframes);
    
    // Cache for 1 minute
    await this.redis.setex(cacheKey, 60, JSON.stringify(snapshot));
    
    return snapshot;
  }
  
  async handleWorkerResult(result) {
    const job = this.processing.get(result.traderId);
    if (!job) return;
    
    this.processing.delete(result.traderId);
    this.completed++;
    
    // Store signals in Supabase
    if (result.signalSymbols && result.signalSymbols.length > 0) {
      await this.createSignals(job, result.signalSymbols);
    }
    
    // Update metrics
    await this.updateTraderMetrics(job.traderId, {
      lastRun: new Date(),
      totalSignals: result.signalSymbols.length
    });
  }
  
  async createSignals(job, symbols) {
    const signals = symbols.map(symbol => ({
      trader_id: job.traderId,
      user_id: job.userId,
      symbol,
      created_at: new Date(),
      metadata: {
        interval: job.interval,
        execution_time: Date.now() - job.timestamp
      }
    }));
    
    await this.supabase
      .from('signals')
      .insert(signals);
  }
}

// Start multiple worker pools for different intervals
['1m', '5m', '15m', '1h', '4h', '1d'].forEach(interval => {
  const pool = new TraderWorkerPool({
    interval,
    maxWorkers: interval === '1m' ? 20 : 5 // More workers for frequent intervals
  });
  pool.start();
});
```

#### 3. Market Data Service

Centralized service for fetching and caching market data:

```javascript
// backend/services/market-data/index.js
import { WebSocket } from 'ws';
import Redis from 'ioredis';
import { Binance } from '@binance/connector';

class MarketDataService {
  constructor() {
    this.redis = new Redis(process.env.REDIS_URL);
    this.binance = new Binance();
    this.wsConnections = new Map();
    this.subscribers = new Map();
  }
  
  async getSnapshot(requiredTimeframes) {
    // Get top 100 USDT pairs
    const symbols = await this.getTopSymbols();
    
    // Get current tickers (cached)
    const tickers = await this.getTickers(symbols);
    
    // Get historical data for each timeframe (cached)
    const historicalData = {};
    for (const symbol of symbols) {
      historicalData[symbol] = {};
      for (const tf of requiredTimeframes) {
        historicalData[symbol][tf] = await this.getKlines(symbol, tf);
      }
    }
    
    return {
      symbols,
      tickers,
      historicalData,
      timestamp: Date.now()
    };
  }
  
  async getTickers(symbols) {
    const cacheKey = 'tickers:current';
    const cached = await this.redis.get(cacheKey);
    
    if (cached && Date.now() - JSON.parse(cached).timestamp < 5000) {
      return JSON.parse(cached).data;
    }
    
    // Fetch fresh tickers
    const response = await this.binance.ticker24hr();
    const tickers = {};
    
    for (const ticker of response.data) {
      if (symbols.includes(ticker.symbol)) {
        tickers[ticker.symbol] = {
          s: ticker.symbol,
          c: parseFloat(ticker.lastPrice),
          P: parseFloat(ticker.priceChangePercent),
          v: parseFloat(ticker.volume),
          q: parseFloat(ticker.quoteVolume),
          h: parseFloat(ticker.highPrice),
          l: parseFloat(ticker.lowPrice)
        };
      }
    }
    
    await this.redis.setex(
      cacheKey,
      5,
      JSON.stringify({ data: tickers, timestamp: Date.now() })
    );
    
    return tickers;
  }
  
  async getKlines(symbol, interval) {
    const cacheKey = `klines:${symbol}:${interval}`;
    const cached = await this.redis.get(cacheKey);
    
    if (cached) {
      const data = JSON.parse(cached);
      // Cache for different durations based on interval
      const maxAge = this.getCacheMaxAge(interval);
      if (Date.now() - data.timestamp < maxAge) {
        return data.klines;
      }
    }
    
    // Fetch fresh klines
    const response = await this.binance.klines(symbol, interval, {
      limit: 250
    });
    
    const klines = response.data.map(k => ({
      t: k[0],
      o: parseFloat(k[1]),
      h: parseFloat(k[2]),
      l: parseFloat(k[3]),
      c: parseFloat(k[4]),
      v: parseFloat(k[5])
    }));
    
    await this.redis.setex(
      cacheKey,
      this.getCacheTTL(interval),
      JSON.stringify({ klines, timestamp: Date.now() })
    );
    
    return klines;
  }
  
  getCacheMaxAge(interval) {
    // How long cached data is valid
    const ages = {
      '1m': 60 * 1000,      // 1 minute
      '5m': 5 * 60 * 1000,  // 5 minutes
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000
    };
    return ages[interval] || 60000;
  }
  
  getCacheTTL(interval) {
    // Redis TTL in seconds
    const ttls = {
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '1h': 3600,
      '4h': 14400,
      '1d': 86400
    };
    return ttls[interval] || 60;
  }
}
```

## Scaling Strategy

### Horizontal Scaling Approach

```yaml
# docker-compose.yml for local development
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  # Multiple worker instances for different intervals
  worker-1m:
    build: ./backend/services/trader-worker
    environment:
      INTERVAL: "1m"
      MAX_WORKERS: 20
      REDIS_URL: redis://redis:6379
    depends_on:
      - redis
    deploy:
      replicas: 3 # 3 instances for 1-minute traders

  worker-5m:
    build: ./backend/services/trader-worker
    environment:
      INTERVAL: "5m"
      MAX_WORKERS: 10
      REDIS_URL: redis://redis:6379
    depends_on:
      - redis
    deploy:
      replicas: 2

  worker-slow:
    build: ./backend/services/trader-worker
    environment:
      INTERVAL: "15m,1h,4h,1d"
      MAX_WORKERS: 5
      REDIS_URL: redis://redis:6379
    depends_on:
      - redis
    deploy:
      replicas: 1

  market-data:
    build: ./backend/services/market-data
    environment:
      REDIS_URL: redis://redis:6379
    depends_on:
      - redis
    ports:
      - "3001:3001"

volumes:
  redis_data:
```

### Kubernetes Deployment for Production

```yaml
# k8s/trader-worker-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: trader-worker-1m
spec:
  replicas: 10 # Scale based on load
  selector:
    matchLabels:
      app: trader-worker
      interval: "1m"
  template:
    metadata:
      labels:
        app: trader-worker
        interval: "1m"
    spec:
      containers:
      - name: worker
        image: trademind/trader-worker:latest
        env:
        - name: INTERVAL
          value: "1m"
        - name: MAX_WORKERS
          value: "20"
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: trader-worker-1m-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: trader-worker-1m
  minReplicas: 3
  maxReplicas: 50
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Pods
    pods:
      metric:
        name: queue_depth # Custom metric from Redis queue size
      target:
        type: AverageValue
        averageValue: "30"
```

## Performance Optimizations

### 1. Batch Processing by Symbol
Group traders analyzing the same symbols:

```javascript
// Group traders by their target symbols
function groupTradersBySymbols(traders) {
  const groups = new Map();
  
  for (const trader of traders) {
    // Hash of required symbols/timeframes
    const key = hashTraderRequirements(trader);
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(trader);
  }
  
  return groups;
}

// Process all traders in a group with same data
async function processBatch(traders, marketData) {
  return Promise.all(
    traders.map(trader => 
      executeTraderFilter(trader, marketData)
    )
  );
}
```

### 2. Smart Caching
Cache at multiple levels:

```javascript
class CacheManager {
  constructor(redis) {
    this.redis = redis;
    this.memory = new Map(); // L1 cache
  }
  
  async get(key) {
    // Check memory first
    if (this.memory.has(key)) {
      const item = this.memory.get(key);
      if (Date.now() - item.timestamp < item.ttl) {
        return item.data;
      }
    }
    
    // Check Redis
    const cached = await this.redis.get(key);
    if (cached) {
      const data = JSON.parse(cached);
      this.memory.set(key, data);
      return data.data;
    }
    
    return null;
  }
  
  async set(key, data, ttl) {
    const item = { data, timestamp: Date.now(), ttl };
    
    // Store in both caches
    this.memory.set(key, item);
    await this.redis.setex(key, ttl / 1000, JSON.stringify(item));
  }
}
```

### 3. Resource Limits by Tier

```javascript
const TIER_LIMITS = {
  free: {
    maxTraders: 3,
    maxExecutionsPerHour: 60,
    priority: 1,
    maxSymbols: 20
  },
  pro: {
    maxTraders: 10,
    maxExecutionsPerHour: 720, // Every 5 seconds
    priority: 2,
    maxSymbols: 50
  },
  elite: {
    maxTraders: -1, // Unlimited
    maxExecutionsPerHour: -1,
    priority: 3,
    maxSymbols: -1
  }
};

async function enforceRateLimit(userId, tier) {
  const limit = TIER_LIMITS[tier].maxExecutionsPerHour;
  if (limit === -1) return true;
  
  const key = `ratelimit:${userId}:${Date.now() / 3600000 | 0}`;
  const count = await redis.incr(key);
  
  if (count === 1) {
    await redis.expire(key, 3600);
  }
  
  return count <= limit;
}
```

## Migration Path

### Phase 1: Setup Infrastructure (Week 1)
1. Deploy Redis cluster
2. Set up Supabase Edge Function for scheduler
3. Deploy first worker pool for testing

### Phase 2: Parallel Running (Week 2)
1. Run backend workers alongside browser execution
2. Compare results for accuracy
3. Monitor performance metrics

### Phase 3: Gradual Migration (Week 3-4)
1. Migrate Free tier users first (lowest load)
2. Then Pro tier users
3. Finally Elite tier users
4. Keep browser fallback option

### Phase 4: Optimization (Week 5)
1. Fine-tune worker pool sizes
2. Optimize caching strategy
3. Implement auto-scaling rules

## Monitoring & Observability

```javascript
// Metrics to track
class MetricsCollector {
  constructor() {
    this.metrics = {
      executionsPerMinute: new Map(),
      averageExecutionTime: new Map(),
      queueDepth: new Map(),
      failureRate: new Map(),
      cacheHitRate: new Map()
    };
  }
  
  async report() {
    // Send to monitoring service
    await prometheus.push({
      jobName: 'trader-worker',
      metrics: this.formatMetrics()
    });
    
    // Alert on anomalies
    if (this.getFailureRate() > 0.05) {
      await alerting.send({
        severity: 'warning',
        message: 'High trader execution failure rate'
      });
    }
  }
}
```

## Cost Analysis

### Infrastructure Costs (Monthly)
- **Redis Cluster**: $50-100 (AWS ElastiCache)
- **Worker Compute**: 
  - 10 t3.medium instances: $300
  - Auto-scaling up to 50 instances: $1,500 max
- **Supabase Edge Functions**: Included in plan
- **Monitoring**: $50 (Datadog/Grafana Cloud)
- **Total**: $400-1,650/month

### Cost Optimization
- Use spot instances for workers (70% savings)
- Reserve instances for baseline capacity
- Implement aggressive caching
- Scale down during low-activity hours

## Advantages of This Approach

1. **Minimal Code Changes**: Reuse ALL existing JavaScript filter code
2. **Proven Technology**: Redis + Node.js is battle-tested
3. **Simple Architecture**: Easy to understand and debug
4. **Flexible Scaling**: Add workers as needed
5. **Cost Effective**: Only pay for what you use
6. **Gradual Migration**: Can run alongside browser execution

## Conclusion

This architecture solves the scheduling challenge by:
- **Distributing load** across multiple worker instances
- **Batching similar jobs** for efficiency  
- **Prioritizing by tier** for fairness
- **Caching aggressively** to reduce API calls
- **Scaling horizontally** as demand grows

The beauty is we keep all existing JavaScript code and just move execution from browser Web Workers to Node.js Worker Threads - minimal changes with maximum scalability.