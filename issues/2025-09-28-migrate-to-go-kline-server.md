# 2025-09-28: Migrate to Go Kline Server

**Status:** 📋 Analysis Phase
**Priority:** P1 - Critical
**Estimated Time:** 2-3 days
**Risk Level:** Medium-High

## Idea

Migrate all application components from Upstash Redis to the new Go-based kline server API. This eliminates Redis dependency, command limits, and provides better performance with in-memory data storage and native WebSocket streaming.

## Context

We've successfully deployed a Go-based kline server that stores market data in memory and provides HTTP/WebSocket APIs. This server:

- **Deployed at:** https://vyx-kline-server.fly.dev
- **Endpoints:**
  - `/health` - Health check
  - `/tickers` - All ticker data
  - `/ticker/{symbol}` - Individual ticker
  - `/klines/{symbol}/{interval}` - Historical klines
  - `/ws` - WebSocket for real-time updates
- **Capacity:** Currently tracking 50 symbols, can scale to 500+
- **Location:** Amsterdam region for optimal Binance compatibility
- **Architecture:** In-memory ring buffers (500 klines per symbol:interval)

This migration eliminates the current Redis-based architecture that has command limits and latency issues.

## Scope

### Components to Update:
1. **Supabase Edge Functions**
   - `supabase/functions/get-klines/index.ts` - Replace Redis calls with Go server HTTP requests
   - `supabase/functions/execute-trader/index.ts` - Replace Redis calls with Go server HTTP requests
   - `supabase/functions/trigger-executions/index.ts` - Replace Redis timestamp tracking with Go server API

2. **Data Collector Service**
   - `apps/data-collector/src/RedisWriter.ts` - **Remove entirely** (Go server replaces this)
   - `apps/data-collector/src/BinanceCollector.ts` - **Remove entirely** (Go server replaces this)
   - **Impact:** Entire data-collector app becomes redundant

3. **Frontend Application**
   - Replace any direct Redis connections (if any)
   - Update WebSocket endpoint to use Go server (`wss://vyx-kline-server.fly.dev/ws`)
   - Update data fetching logic to use new API format

4. **Infrastructure**
   - Remove Redis dependencies from environment variables
   - Remove data-collector Fly.io deployment
   - Update deployment documentation
   - Remove Redis-related configuration

### Data Format Migration:
- **From:** Redis ZRANGE string format with JSON parsing
- **To:** Go server native JSON API with proper numeric types

### Architectural Impact:
**Current Architecture:**
```
Binance WebSocket → Data Collector → Redis → Supabase Edge Functions → Frontend
```

**New Architecture:**
```
Binance WebSocket → Go Kline Server → Supabase Edge Functions → Frontend
                                   ↘ WebSocket → Frontend (real-time)
```

**Key Changes:**
- **Eliminates:** Redis dependency, data-collector service, JSON parsing overhead
- **Simplifies:** Direct HTTP API calls, native Go WebSocket streaming
- **Reduces:** Infrastructure complexity, deployment surface area

---

## Engineering Review

### Current Redis Dependencies Analysis

Based on codebase analysis, I found the following Redis dependencies:

#### 1. Supabase Edge Function: `get-klines/index.ts`
- **Lines 2, 19-26:** Imports and initializes Upstash Redis client
- **Lines 150-154:** Uses `redis.zrange()` to fetch klines from Redis sorted sets
- **Lines 166-167:** Fetches 1m klines for ticker derivation (1440 minutes = 24h)
- **Redis Keys Used:**
  - `klines:${symbol}:${timeframe}` - Kline data storage
  - Fetches with `ZRANGE key -limit -1` pattern

#### 2. Supabase Edge Function: `execute-trader/index.ts`
- **Lines 3, 11-13:** Imports and initializes Upstash Redis client
- **Lines 88-89:** Fetches 1m klines for ticker derivation
- **Lines 113-121:** Fetches klines for required timeframes
- **Redis Pattern:** Same `klines:${symbol}:${timeframe}` pattern

#### 3. Supabase Edge Function: `trigger-executions/index.ts`
- **Lines 3, 10-12:** Imports and initializes Upstash Redis client
- **Lines 42-48:** Uses Redis for tracking last processed candle timestamps
- **Redis Keys Used:**
  - `lastClosed:${symbol}:${interval}` - Last closed candle timestamp
  - `lastProcessed:${symbol}:${interval}` - Last processed timestamp

#### 4. Data Collector Service: `apps/data-collector/src/RedisWriter.ts`
- **Lines 1, 15-16:** Imports and uses Redis for writing market data
- **Purpose:** Writes kline data from Binance WebSocket to Redis
- **Redis Operations:** ZADD operations for kline storage
- **Impact:** This component becomes redundant with Go server migration

#### 3. Data Transformation Required:
Current Redis stores data as JSON strings that need parsing:
```typescript
// Current Redis format
const rawKlines = await redis.zrange(klineKey, -limit, -1) as string[];
const klines = rawKlines.map(k => parseKlineFromRedis(k));

// New Go server format (direct JSON)
const response = await fetch(`${GO_SERVER_URL}/klines/${symbol}/${interval}`);
const { klines } = await response.json();
```

### Frontend WebSocket Analysis

From the codebase analysis:
- **No direct Redis usage** in frontend - already uses proper service layer
- **Current WebSocket:** App uses Supabase Realtime WebSocket for signals
- **Data Flow:** Frontend → Supabase Edge Functions → Redis → Response
- **New Data Flow:** Frontend → Supabase Edge Functions → Go Server → Response

### Technical Feasibility Assessment

#### ✅ **Low Risk Areas:**
1. **API Interface Compatibility:** Go server provides similar data structure
2. **No Frontend Redis:** Frontend already uses proper service abstraction
3. **Incremental Migration:** Can update one Edge Function at a time
4. **Data Format:** Go server returns properly typed JSON (no parsing needed)

#### ⚠️ **Medium Risk Areas:**
1. **Network Dependencies:** Adding HTTP calls between Edge Functions and Go server
2. **Error Handling:** Different error patterns from HTTP vs Redis
3. **Latency Changes:** HTTP calls vs Redis commands have different latency profiles

#### 🔴 **High Risk Areas:**
1. **Authentication:** Go server currently has no authentication (accepts all origins)
2. **Rate Limiting:** No rate limiting on Go server endpoints
3. **Availability:** Single point of failure if Go server is down
4. **Data Consistency:** Redis atomic operations vs HTTP request patterns

### Performance Implications

#### **Positive Impact:**
- **Eliminates Redis command limits** (current bottleneck)
- **Reduces data parsing overhead** (Redis JSON strings → Native JSON)
- **Better memory efficiency** (Go's ring buffers vs Redis storage)
- **Direct WebSocket streaming** from Go server to clients

#### **Potential Concerns:**
- **Network hop latency:** Edge Function → Go Server (vs local Redis)
- **HTTP overhead:** Request/response headers vs Redis protocol
- **Connection pooling:** Need to manage HTTP connections efficiently

#### **Estimated Performance:**
- **Redis Call:** ~2-5ms per operation
- **Go Server HTTP:** ~10-20ms per request (includes network)
- **Net Impact:** Slightly higher latency but eliminates rate limiting

---

## Migration Strategy

### Phase 1: Infrastructure Preparation (4 hours)
1. **Go Server Hardening:**
   - Add authentication/API key validation
   - Implement rate limiting
   - Add request logging and monitoring
   - Configure CORS policies properly

2. **Environment Setup:**
   - Add `GO_KLINE_SERVER_URL` environment variable
   - Add `GO_KLINE_SERVER_API_KEY` if implementing auth
   - Keep Redis credentials for rollback

### Phase 2: Edge Function Migration (8 hours)

#### 2.1: Update `get-klines` Function
```typescript
// Replace Redis calls with HTTP calls
const response = await fetch(`${GO_SERVER_URL}/klines/${symbol}/${interval}?limit=${limit}`);
const data = await response.json();
```

#### 2.2: Update `execute-trader` Function
```typescript
// Replace Redis kline fetching
const klinesResponse = await fetch(`${GO_SERVER_URL}/klines/${symbol}/${timeframe}`);
const { klines } = await klinesResponse.json();
```

#### 2.3: Update `trigger-executions` Function
```typescript
// Replace Redis timestamp tracking with Go server API
// Option 1: Use Go server metadata endpoint for last update times
// Option 2: Remove timestamp tracking entirely (Go server handles this)
// Recommended: Simplify to use Go server's real-time nature
```

#### 2.4: Update Shared Utilities
- Modify `deriveTickerFromKlines.ts` if needed for new data format
- Update error handling patterns
- Add HTTP client utilities for consistent requests

### Phase 3: Data Collector Cleanup (3 hours)
1. **Stop Data Collector:** Shutdown Fly.io data-collector deployment
2. **Remove Components:** Delete data-collector source code and configs
3. **Update Dependencies:** Remove data-collector from monorepo structure
4. **Verify Transition:** Ensure Go server is collecting all required data

### Phase 4: Frontend Integration (2 hours)
1. **WebSocket Update:** Update any direct Go server WebSocket connections
2. **Error Handling:** Update error UI for new failure modes
3. **Testing:** Verify data flow end-to-end

### Phase 5: Cleanup and Monitoring (2 hours)
1. **Remove Redis Dependencies:** Clean up imports and environment variables
2. **Update Documentation:** Deployment guide and architecture docs
3. **Add Monitoring:** Performance metrics and health checks

---

## Rollback Plan

### Immediate Rollback (< 5 minutes):
1. **Revert Edge Functions:** Use git to restore Redis-based versions
2. **Environment Variables:** Switch back to Redis credentials
3. **Deploy:** Push reverted functions to Supabase

### Data Consistency:
- **No data loss risk:** Migration doesn't modify stored data
- **Real-time continuity:** Go server continues independent operation
- **Client impact:** Brief interruption during function deployment

---

## Testing Requirements

### Unit Tests:
- [ ] HTTP client error handling in Edge Functions
- [ ] Data format transformation from Go server JSON
- [ ] Authentication and rate limiting (if implemented)

### Integration Tests:
- [ ] End-to-end data flow: Frontend → Edge Function → Go Server
- [ ] WebSocket connectivity and message format
- [ ] Error propagation and recovery

### Load Tests:
- [ ] Edge Function performance with HTTP calls vs Redis
- [ ] Go server capacity under Edge Function load
- [ ] WebSocket scaling with multiple clients

### Manual Tests:
- [ ] Trading signal execution with new data source
- [ ] Chart rendering with Go server kline data
- [ ] Error scenarios (Go server down, network issues)

---

## Risk Mitigation

### 1. **Go Server Availability**
- **Risk:** Single point of failure
- **Mitigation:** Implement health checks, automated restarts, backup instances

### 2. **Authentication Security**
- **Risk:** Open Go server endpoints
- **Mitigation:** Implement API key authentication before migration

### 3. **Performance Regression**
- **Risk:** Higher latency than Redis
- **Mitigation:** Benchmark before/after, implement caching if needed

### 4. **Data Format Issues**
- **Risk:** Breaking changes in data structure
- **Mitigation:** Comprehensive testing, gradual rollout

---

## Success Criteria

### Functional:
- [ ] All Edge Functions successfully fetch data from Go server
- [ ] Frontend displays real-time market data correctly
- [ ] Trading signals execute without data fetch errors
- [ ] WebSocket connections remain stable

### Performance:
- [ ] Edge Function response times ≤ 200ms (vs current Redis ~50ms)
- [ ] Zero Redis command limit errors
- [ ] Memory usage remains stable
- [ ] WebSocket message throughput ≥ current levels

### Operational:
- [ ] Deployment documentation updated
- [ ] Monitoring and alerting configured
- [ ] Team trained on new architecture
- [ ] Rollback procedure validated

---

## Implementation Checklist

### Pre-Migration:
- [ ] Go server authentication implemented
- [ ] Load testing completed
- [ ] Backup/rollback procedure documented
- [ ] Team notification and approval

### Migration:
- [ ] Environment variables configured
- [ ] Edge Functions updated and tested
- [ ] Frontend updates deployed
- [ ] End-to-end verification completed

### Post-Migration:
- [ ] Redis dependencies removed
- [ ] Performance monitoring active
- [ ] Documentation updated
- [ ] Post-mortem scheduled

---

**Next Step:** Begin Phase 1 infrastructure preparation with Go server hardening and authentication implementation.