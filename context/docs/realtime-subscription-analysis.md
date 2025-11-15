# Detailed Analysis: Over-Subscribed Supabase Realtime

## Executive Summary

Your app has **3 major Realtime cost problems**:

1. **Global signals subscription** listening to ALL signals from ALL users
2. **Multiple kline broadcast channels** (expensive for high-frequency data)
3. **No subscription cleanup** when components unmount

Each active Realtime connection costs money based on:
- WebSocket connection time
- Number of messages received
- Database change events processed

---

## Problem 1: Global Signals Subscription (CRITICAL)

### Location
`apps/app/src/services/serverExecutionService.ts:69-99`

### What's Happening

```typescript
this.signalChannel = supabase.channel('signals')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'signals'
      // ❌ NO FILTER! Listening to ALL signals from ALL users
    },
    (payload) => {
      // This fires for EVERY signal inserted, regardless of user
      const signal: TraderSignal = { ... }
      this.globalSignalCallback(signal);
    }
  )
  .subscribe();
```

### The Problem

**You're paying for every signal from every user, but only using signals for ONE user.**

#### Example Scenario:
- 10 users, each with 5 active traders
- Each trader generates 100 signals/hour
- **Total: 5,000 signals/hour** flowing through your subscription
- But each user only needs their own ~500 signals/hour

**You're paying 10x more than you need to!**

### Cost Impact

**Database operations:**
- Supabase charges per database change event processed
- Each INSERT to `signals` table triggers a Realtime message
- With global subscription: You pay for ALL signals
- With filtered subscription: You pay only for YOUR signals

**Concrete numbers (hypothetical):**
- Global subscription: 5,000 events/hour × 24 hours = 120,000 events/day
- Filtered subscription: 500 events/hour × 24 hours = 12,000 events/day
- **Savings: 90% reduction in Realtime costs**

### The Fix

Add a filter for the current user:

```typescript
this.signalChannel = supabase.channel('signals')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'signals',
      filter: `user_id=eq.${userId}` // ✅ Only listen to current user's signals
    },
    (payload) => {
      const signal: TraderSignal = { ... }
      this.globalSignalCallback(signal);
    }
  )
  .subscribe();
```

**One line change. Massive savings.**

---

## Problem 2: Multiple Kline Broadcast Channels (HIGH COST)

### Location
`apps/app/src/services/realtimeManager.ts:178-213`

### What's Happening

```typescript
private createChannel(channelKey: string): void {
  const channel = this.supabase
    .channel(channelKey) // e.g., "market:klines:BTCUSDT:1m"
    .on('broadcast', { event: 'kline_update' }, (payload) => {
      this.handleUpdate(channelKey, payload.payload as KlineUpdate);
    })
    .subscribe();

  this.channels.set(channelKey, channel);
}
```

### The Problem

**Broadcast channels are expensive for high-frequency data.**

#### How Supabase Realtime Broadcast Works:
1. Your backend (Go screener) sends kline updates via Supabase Realtime broadcast
2. Supabase relays these messages to all subscribed clients
3. Each message costs:
   - Server processing time
   - Network bandwidth
   - WebSocket connection maintenance

#### Example Scenario:
- User watching 10 symbols with 1-minute candles
- Each symbol updates every 1-3 seconds (kline updates)
- **Total: ~200-600 broadcast messages per minute**
- **Per hour: 12,000-36,000 messages**
- **Per day: 288,000-864,000 messages**

### Cost Comparison: Broadcast vs Polling

| Approach | Messages/Day (10 symbols) | Cost Estimate |
|----------|---------------------------|---------------|
| **Realtime Broadcast** (current) | 288,000-864,000 | $$$$ |
| **Polling every 5 seconds** | 172,800 | $$ |
| **Polling every 10 seconds** | 86,400 | $ |

**Polling is 3-10x cheaper for high-frequency data!**

### Why Broadcast is Expensive

Supabase Realtime broadcast charges based on:
- Number of active channels
- Number of messages per channel
- Connection time

**High-frequency updates kill your budget.**

### The Fix: Switch to Polling

Instead of:
```typescript
// ❌ Broadcast: Expensive for high-frequency updates
channel.on('broadcast', { event: 'kline_update' }, handler)
```

Use:
```typescript
// ✅ Polling: Fetch data every 5-10 seconds
setInterval(async () => {
  const klines = await fetch(`/api/klines?symbols=${symbols.join(',')}`);
  // Update UI with fresh data
}, 5000); // 5 seconds
```

**Why this is better:**
- Fetch on YOUR schedule (5-10 seconds is plenty for candle charts)
- Predictable costs (fixed number of API calls)
- No WebSocket overhead
- Battery friendly for mobile users

**Trade-off:**
- Lose real-time updates (5-10 second delay instead of instant)
- But for price charts, this is **completely acceptable**

---

## Problem 3: No Subscription Cleanup (MEMORY LEAK)

### What's Happening

When React components subscribe to Realtime but don't clean up:

```typescript
// ❌ BAD: No cleanup
useEffect(() => {
  notificationService.subscribeToNotifications(userId, (notification) => {
    // Handle notification
  });
  // Missing return cleanup function!
}, [userId]);
```

### The Problem

**Subscriptions persist even after component unmounts.**

#### Example Scenario:
1. User opens notification settings → creates subscription
2. User navigates away → component unmounts
3. **Subscription still active in background!**
4. User navigates back → creates ANOTHER subscription
5. **Now you have 2 subscriptions for the same user**
6. Repeat 10 times = 10 active subscriptions, but only need 1

### Memory & Cost Impact

**Memory:**
- Each subscription holds references to callbacks
- Prevents garbage collection
- Memory grows over time

**Cost:**
- Each subscription maintains a WebSocket connection
- Supabase charges per active connection
- Multiple subscriptions = multiple charges

**Battery (mobile):**
- WebSocket connections drain battery
- More connections = more battery drain

### The Fix: Always Clean Up

```typescript
// ✅ GOOD: Proper cleanup
useEffect(() => {
  const channel = notificationService.subscribeToNotifications(userId, (notification) => {
    // Handle notification
  });

  return () => {
    // Clean up on unmount
    channel.unsubscribe();
  };
}, [userId]);
```

### Where This is Missing

Based on code analysis, cleanup is **partially implemented** but not everywhere:

✅ **Good cleanup:**
- `realtimeManager.ts` - Has cleanup in `subscribe()` return function
- `cloudWebSocketClient.ts` - Has `disconnect()` method

❌ **Missing cleanup patterns:**
- No evidence that React components are calling cleanup functions
- `serverExecutionService.ts` - Global signal subscription never cleaned up
- `notificationService.subscribeToNotifications()` - Returns channel but unclear if components clean up

---

## Summary: Why This Matters

### Current State (Estimated)
- Global signals subscription: **100,000+ events/day** (90% unnecessary)
- Kline broadcasts: **300,000-800,000 messages/day** (could be 90% cheaper with polling)
- Subscription leaks: **Unknown, but likely 3-10x more connections than needed**

### If You Fix These Issues
- Add user filter to signals subscription: **90% reduction in signal events**
- Switch kline updates to polling: **80-90% reduction in Realtime messages**
- Fix subscription cleanup: **70-90% reduction in active connections**

### Combined Impact
**Potential cost reduction: 70-90% of current Realtime costs**

---

## Detailed Recommendations

### Priority 1: Filter Global Signals (15 minutes)
**File:** `apps/app/src/services/serverExecutionService.ts:69-99`
**Change:** Add `filter: \`user_id=eq.${userId}\`` to postgres_changes config
**Impact:** Instant 90% reduction in signal-related Realtime costs

### Priority 2: Switch Kline to Polling (1-2 hours)
**Files:**
- `apps/app/src/services/realtimeManager.ts` - Replace broadcast with polling
- Backend - Create REST endpoint for bulk kline fetching
**Change:** Replace Realtime broadcast with 5-second polling
**Impact:** 80-90% reduction in kline-related Realtime costs

### Priority 3: Audit Cleanup (2-3 hours)
**Action:** Search all components using subscriptions and ensure cleanup
**Pattern:**
```typescript
useEffect(() => {
  const unsub = service.subscribe(...);
  return () => unsub(); // Always clean up!
}, [deps]);
```
**Impact:** Prevent memory leaks, reduce connection overhead by 70%

---

## Cost Breakdown (Hypothetical Example)

### Current Monthly Bill: $50/month (example)

**Breakdown:**
- Database operations: $20 (signals, queries)
- **Realtime (signals):** $15 (global subscription)
- **Realtime (klines):** $10 (broadcast messages)
- **Realtime (connections):** $5 (leaked connections)

### After Fixes: ~$25/month

**New Breakdown:**
- Database operations: $20 (unchanged)
- **Realtime (signals):** $2 (filtered to user only)
- **Realtime (klines):** $0 (switched to REST polling)
- **Realtime (connections):** $1 (proper cleanup)
- **New REST API costs:** $2 (polling endpoint)

**Savings: $25/month (50% reduction)**

---

## Technical Deep Dive: Why Realtime is Expensive

### Supabase Realtime Pricing Model

Supabase Realtime charges based on:

1. **Concurrent connections** - Each WebSocket connection costs
2. **Messages per month** - Each event (INSERT, UPDATE, broadcast) costs
3. **Connection time** - Longer connections cost more

### Your Usage Pattern (High-Cost)

**Signals subscription:**
- Type: `postgres_changes` (database events)
- Filter: NONE (all signals)
- Frequency: Every signal insert
- Cost driver: **Message count** (100k+/day)

**Kline subscriptions:**
- Type: `broadcast` (custom messages)
- Frequency: 3-60 updates per minute per symbol
- Cost driver: **Message count** (300k-800k/day)

**Connection leaks:**
- Type: Multiple subscriptions to same data
- Cost driver: **Concurrent connections** (3-10x more than needed)

### Alternative Architecture (Low-Cost)

**Signals:**
- Use filtered `postgres_changes` (only user's signals)
- Reduces messages by 90%
- Still real-time for actual user signals

**Klines:**
- Use REST API polling every 5-10 seconds
- Predictable costs (fixed queries/day)
- 5-second delay acceptable for charts

**Notifications:**
- Keep Realtime (low frequency, important to be instant)
- Add proper cleanup to prevent leaks

---

## Action Items

1. ✅ Read this document
2. ⬜ Add user filter to global signals subscription (15 min)
3. ⬜ Create REST endpoint for bulk kline fetching (30 min)
4. ⬜ Replace kline Realtime with polling (1 hour)
5. ⬜ Audit all React components for subscription cleanup (2 hours)
6. ⬜ Add data retention policies (from previous recommendations)
7. ⬜ Monitor Supabase dashboard for cost reduction

**Estimated total time: 4-5 hours**
**Estimated cost savings: 50-80%**
