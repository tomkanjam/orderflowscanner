# No Signals Being Generated - Debug Report 🔍

**Date:** 2025-10-03
**Issue:** Machine running with `totalSignals: 0` despite 420+ screenings
**Status:** 🔍 Investigating with new logging

---

## Problem

Fly machine logs show:
```
totalScreenings: 420
totalSignals: 0        ← No signals generated!
totalAnalyses: 0
errors: 0
```

The machine is:
- ✅ Running healthy
- ✅ Loading 6 traders
- ✅ Executing filters every minute
- ✅ Returning "6 results" per screening
- ❌ **NOT generating any signals**

---

## Root Cause Analysis

### Discovery: Signal Deduplication

Looking at the worker code (`server/fly-machine/workers/screener-worker.ts:149-160`):

```typescript
if (isMatch) {
  currentSymbols.add(symbol);

  // Only report if this is a new match (signal)
  if (!previousSymbols.has(symbol)) {
    matches.push({
      symbol,
      price: parseFloat(ticker.c),
      matchedConditions
    });
  }
}
```

**Key Insight:** The worker uses **deduplication**! It only reports a symbol as a match if it's a **NEW** match that wasn't matching in the previous screening.

This prevents duplicate signals for symbols that continuously meet the conditions.

### What "6 Results" Means

The log `[Orchestrator] Screening complete: 6 results in 4ms` means:
- **6 traders were screened** (not 6 signals)
- Each trader returns a result with `matches: []` array
- If `matches` is empty = no NEW signals for that trader

### Two Possible Scenarios

**Scenario 1: No Matches At All**
- Traders' filter conditions are too strict
- Current market conditions don't meet any trader criteria
- Filters might be broken or expecting specific setups

**Scenario 2: Matches But No NEW Signals**
- Traders matched some symbols in the FIRST screening
- Those symbols STILL match in subsequent screenings
- Since they're not "new" matches, no signals are created
- `totalSignals: 0` because all matches were in the initial screening

**Scenario 2 is likely** since the machine ran for 20+ minutes with 420 screenings.

---

## What We Added: Detailed Logging

### Changes Made

**File:** `server/fly-machine/workers/screener-worker.ts`

**Added logging (lines 169-179):**
```typescript
// Log screening results for debugging
const totalMatching = currentSymbols.size;
const newSignals = matches.length;
const continuingMatches = totalMatching - newSignals;

if (totalMatching > 0 || matches.length > 0) {
  console.log(`[Worker] Trader "${trader.name}": ${totalMatching} symbols matching (${newSignals} new signals, ${continuingMatches} continuing)`);
  if (matches.length > 0) {
    console.log(`[Worker]   New signals: ${matches.map(m => m.symbol).join(', ')}`);
  }
}
```

### What This Logs

**If trader is matching symbols:**
```
[Worker] Trader "RSI Oversold": 3 symbols matching (0 new signals, 3 continuing)
```
This means: 3 symbols meet the conditions but all 3 were already matching (no new signals).

**If trader finds NEW signals:**
```
[Worker] Trader "RSI Oversold": 5 symbols matching (2 new signals, 3 continuing)
[Worker]   New signals: BTCUSDT, ETHUSDT
```
This means: 5 symbols matching total, 2 are brand new (signals created), 3 were already matching.

**If trader finds nothing:**
No log output = trader didn't match any symbols.

---

## Next Steps

### 1. Provision Fresh Machine with New Logging

**From the UI:**
1. Navigate to Cloud Execution panel
2. Click "Start Machine"
3. Wait for status to show "Running"

**The new machine will use:**
- Latest image with logging: `registry.fly.io/vyx-app:latest`
- Updated worker with detailed match logging

### 2. Monitor Logs

**Command:**
```bash
export PATH="$HOME/.fly/bin:$PATH"
fly logs -a vyx-app -i <machine-id>
```

**Look for:**
```
[Worker] Trader "..." : X symbols matching (Y new signals, Z continuing)
```

### 3. Interpret Results

**Case A: No log output at all**
- Traders aren't matching ANY symbols
- Filters might be too strict or broken
- Action: Check trader filter conditions

**Case B: Logs show matches but 0 new signals**
```
[Worker] Trader "RSI Oversold": 3 symbols matching (0 new signals, 3 continuing)
```
- Traders ARE working!
- Symbols matched in first screening and continue to match
- No new signals because no NEW matches
- Action: This is **correct behavior** - wait for market conditions to change

**Case C: Logs show NEW signals**
```
[Worker] Trader "RSI Oversold": 5 symbols matching (2 new signals, 3 continuing)
[Worker]   New signals: BTCUSDT, ETHUSDT
```
- Signals being created!
- Check database to verify signals are being saved
- If signals in logs but not database = write failure

---

## What To Check In Database

### Check if traders are properly configured:

```sql
SELECT
  id,
  name,
  enabled,
  filter->>'code' as filter_code
FROM traders
WHERE user_id = '63eea370-27a1-4099-866a-e3ed340b278d'
  AND enabled = true;
```

### Check if any signals exist (from previous runs):

```sql
SELECT
  COUNT(*) as total_signals,
  COUNT(DISTINCT trader_id) as traders_with_signals,
  MAX(created_at) as most_recent_signal
FROM signals
WHERE trader_id IN (
  SELECT id FROM traders WHERE user_id = '63eea370-27a1-4099-866a-e3ed340b278d'
);
```

### Check if cloud signals are being written:

```sql
SELECT
  s.symbol,
  s.price,
  s.matched_conditions,
  s.created_at,
  s.source,
  t.name as trader_name
FROM signals s
JOIN traders t ON s.trader_id = t.id
WHERE s.source = 'cloud'
  AND t.user_id = '63eea370-27a1-4099-866a-e3ed340b278d'
ORDER BY s.created_at DESC
LIMIT 10;
```

---

## Technical Details

### Signal Creation Flow

```
1. Worker executes filter for each symbol
   ↓
2. Filter returns true/false (match/no match)
   ↓
3. If match: Add to currentSymbols Set
   ↓
4. Check: Is this a NEW match?
   - Compare currentSymbols vs previousSymbols
   - NEW = not in previousSymbols
   ↓
5. If NEW: Add to matches array (creates signal)
   ↓
6. Update previousSymbols for next screening
   ↓
7. Return matches to Orchestrator
   ↓
8. Orchestrator queues signals for database write
   ↓
9. StateSynchronizer batch writes every 10 seconds
```

### Why Deduplication?

**Without deduplication:**
```
Screening 1: BTCUSDT matches → Signal created ✅
Screening 2: BTCUSDT matches → Signal created ✅ (DUPLICATE!)
Screening 3: BTCUSDT matches → Signal created ✅ (DUPLICATE!)
... spam signals every minute
```

**With deduplication:**
```
Screening 1: BTCUSDT matches → Signal created ✅ (NEW)
Screening 2: BTCUSDT matches → No signal (continuing)
Screening 3: BTCUSDT matches → No signal (continuing)
Screening 4: BTCUSDT no match → (exited position)
Screening 5: BTCUSDT matches → Signal created ✅ (NEW re-entry)
```

Deduplication ensures signals only fire when a symbol **first enters** the conditions, not on every candle it remains in them.

---

## Expected Outcome

After provisioning new machine with logging, you'll see one of:

**Healthy Behavior:**
```
[Worker] Trader "Momentum Break": 2 symbols matching (0 new signals, 2 continuing)
[Worker] Trader "RSI Divergence": 5 symbols matching (1 new signals, 4 continuing)
[Worker]   New signals: ETHUSDT
```
- Traders working correctly
- Some matches continuing, occasional new signals
- This is normal behavior

**Problem Behavior:**
```
[ParallelScreener] Executing filters for 6 traders...
[Orchestrator] Screening complete: 6 results in 4ms
```
- No worker logs at all
- Means NO traders are matching ANY symbols
- Filter conditions might be too strict

---

## Quick Diagnosis Commands

```bash
# View new logs with detailed matching info
export PATH="$HOME/.fly/bin:$PATH"
fly logs -a vyx-app -i <machine-id> | grep "\[Worker\]"

# Check machine status
fly machines list --app vyx-app

# SSH into machine for live debugging
fly ssh console -a vyx-app --select

# Inside machine, check worker process
ps aux | grep screener-worker
```

---

## Summary

**What we know:**
- ✅ Machine is healthy and running
- ✅ Traders are being screened (420+ times)
- ❌ Zero signals generated (`totalSignals: 0`)

**Most likely reason:**
- Traders matched symbols in initial screening
- Those symbols continue to match (no NEW signals)
- Deduplication prevents duplicate signals
- This is **correct behavior**

**Next action:**
1. Provision new machine to get detailed logs
2. Check logs for `[Worker] Trader "..." : X matching`
3. Determine if traders are working or need adjustment

**If logs show "X matching (0 new, X continuing)":**
- Traders ARE working! ✅
- Just waiting for new market conditions
- System is functioning correctly

**If logs show nothing:**
- Traders NOT matching any symbols ❌
- Need to review filter conditions
- Market might not meet criteria

---

## Files Modified

1. `server/fly-machine/workers/screener-worker.ts`
   - Added lines 169-179: Detailed match logging

2. Deployed to Fly.io:
   - Image: `registry.fly.io/vyx-app:deployment-01K6N14RD5TY9T2QPDVRKSGD5E`
   - Tagged as: `:latest`

3. Old machine stopped:
   - Machine `d89953db4e16e8` stopped (had old code)
   - Ready to provision fresh machine with new logging

---

**Status:** 🎯 Ready to test - Provision new machine and check logs!
