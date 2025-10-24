# Debug Report: All Traders Returning 0 Matches

**Date:** 2025-09-30
**Issue:** All 8 enabled traders consistently return 0 matches across multiple execution cycles
**Severity:** Critical - Complete system failure for signal generation

---

## Executive Summary

**Root Cause Identified:** Double JSON encoding in database storage layer

All traders are returning 0 matches because the `filter` column in the `traders` table is storing JSON objects as JSON *strings* (double-encoded), causing the Edge Functions to be unable to access the filter code.

---

## Investigation Timeline

### 1. Initial Symptoms
- Logs show 8 traders executing every minute
- All traders report "0 matches" for 43 symbols
- Execution completes successfully (no errors)
- One trader occasionally fails with HTTP 503 boot error

### 2. Key Evidence

**Database Query Results:**
```sql
SELECT
  name,
  jsonb_typeof(filter) as stored_type,
  (filter->>'code') IS NOT NULL as can_access_code
FROM traders
WHERE enabled = true;
```

**Result:**
```
name                          | stored_type | can_access_code
------------------------------|-------------|----------------
1m Mean Reversion             | string      | false
1m Pullback Trend Rider       | string      | false
3 Bar Drop Momentum           | string      | false
... (all 8 traders)           | string      | false
```

**The Problem:**
- `stored_type` should be `"object"` but is `"string"`
- `can_access_code` should be `true` but is `false`

### 3. Data Inspection

**What's stored in the database:**
```
filter: "\"{\\\"code\\\":\\\"const klines = timeframes['1m'];..."
```

This is a JSON string containing a JSON object (double-encoded).

**What should be stored:**
```
filter: {"code":"const klines = timeframes['1m'];...", "indicators":[...]}
```

---

## Root Cause Analysis

### The Serialization Bug

**Location:** `apps/app/src/services/traderManager.ts:360`

```typescript
private serializeTrader(trader: Trader): any {
  return {
    id: trader.id,
    name: trader.name,
    // ... other fields
    filter: JSON.stringify(trader.filter),  // ← BUG: Double encoding!
    strategy: JSON.stringify(trader.strategy),
    metrics: JSON.stringify(trader.metrics),
    // ...
  };
}
```

### Why This Breaks Everything

1. **Frontend creates trader:**
   ```typescript
   trader.filter = {
     code: "const klines = ...",
     indicators: [...],
     requiredTimeframes: ["1m"]
   }
   ```

2. **traderManager.serializeTrader() is called:**
   ```typescript
   filter: JSON.stringify(trader.filter)
   // Produces: "{\"code\":\"...\",\"indicators\":[...]}"
   ```

3. **Supabase stores in JSONB column:**
   - PostgreSQL receives a string value
   - JSONB column stores it as: `"string value"` (not an object)
   - Data type becomes: `jsonb_typeof() = "string"`

4. **Edge Function fetches trader:**
   ```typescript
   const { data: trader } = await supabase
     .from('traders')
     .select('*')
     .eq('id', traderId)
     .single();

   // trader.filter is now a STRING, not an object
   // trader.filter = "\"{\\\"code\\\":\\\"const klines...\\\"\""
   ```

5. **Edge Function tries to access code:**
   ```typescript
   trader.filter.code  // undefined (can't access property on string)
   ```

6. **Filter execution fails silently:**
   ```typescript
   const filterFunction = new Function(
     'ticker',
     'klines',
     helpers + '\n' + trader.filter.code  // undefined → empty code
   );
   ```

7. **Result:** No matches, every time.

---

## Why Tests May Have Passed

The `deserializeTrader()` method (line 378) correctly handles this:

```typescript
const filter = typeof data.filter === 'string'
  ? JSON.parse(data.filter)  // Fixes double-encoding for frontend
  : data.filter;
```

This means:
- ✅ **Frontend** sees correct data (deserialized properly)
- ❌ **Edge Functions** see broken data (no deserialization)

The bug only manifests in Edge Functions that fetch directly from Supabase without going through traderManager.

---

## Impact Assessment

**Affected Systems:**
- ❌ All trader executions (0 signals generated)
- ❌ All signal matching logic
- ❌ All automated trading based on signals
- ✅ Frontend UI (works due to deserialization layer)
- ✅ Manual testing in browser (works due to deserialization layer)

**Blast Radius:**
- 100% of automated signal generation
- Approximately 8 traders × 43 symbols × 60 executions/hour = 20,640+ failed match attempts per hour

---

## Resolution Options

### Option 1: Fix Serialization (Recommended)
**Change:** Remove `JSON.stringify()` calls for JSONB columns

```typescript
// traderManager.ts:360
private serializeTrader(trader: Trader): any {
  return {
    id: trader.id,
    name: trader.name,
    // ... other fields
    filter: trader.filter,          // ✓ Store object directly
    strategy: trader.strategy,      // ✓ Store object directly
    metrics: trader.metrics,        // ✓ Store object directly
    // ...
  };
}
```

**Pros:**
- Correct solution
- Fixes root cause
- No data migration needed (objects work in both formats)

**Cons:**
- Requires code deployment
- May affect backward compatibility if old code expects strings

---

### Option 2: Fix Edge Function (Workaround)
**Change:** Add deserialization to Edge Function

```typescript
// execute-trader/index.ts:189
const { data: trader } = await supabase
  .from('traders')
  .select('*')
  .eq('id', traderId)
  .single();

// Add deserialization
if (typeof trader.filter === 'string') {
  trader.filter = JSON.parse(trader.filter);
}
```

**Pros:**
- Quick fix
- Matches frontend deserialization pattern

**Cons:**
- Doesn't fix root cause
- Technical debt
- All future Edge Functions need this workaround

---

### Option 3: Database Migration (Overkill)
**Change:** Migrate all existing filter data from strings to objects

**Pros:**
- Clean slate

**Cons:**
- Complex migration script needed
- Risky (data corruption possible)
- Still need Option 1 to prevent reoccurrence

---

## Recommended Action

**Implement Option 1 + Option 2 (Hybrid Approach):**

1. **Immediate:** Add deserialization to Edge Functions (Option 2)
   - Gets signals working immediately
   - Zero risk

2. **Next:** Fix serialization in traderManager (Option 1)
   - Prevents future traders from having this issue
   - Existing traders continue to work via deserialization

3. **Optional:** Gradually migrate existing data
   - Update traders one-by-one as they're modified
   - No risky bulk migration needed

---

## Verification Steps

After implementing fix, verify:

```sql
-- Should show "object" for all traders
SELECT name, jsonb_typeof(filter) as type
FROM traders
WHERE enabled = true;
```

```sql
-- Should show true for all traders
SELECT name, (filter->>'code') IS NOT NULL as has_code
FROM traders
WHERE enabled = true;
```

```bash
# Should show matches > 0 for at least some traders
supabase functions logs execute-trader --follow
```

---

## Prevention

**Code Review Checklist:**
- [ ] Never use `JSON.stringify()` before inserting into JSONB columns
- [ ] PostgreSQL handles JSON serialization automatically
- [ ] Always test Edge Functions independently from frontend
- [ ] Add integration tests that verify data types in database

**Testing Gap Identified:**
- Edge Functions were not tested independently
- All testing went through frontend (which has deserialization)
- Need direct Edge Function invocation tests

---

## Additional Notes

- The occasional HTTP 503 "BOOT_ERROR" for trader `cc8f57a5-d6ad-4d8a-98ec-f0bb51a9b41b` ("4-Bar Momentum Scalp") is likely unrelated - possibly a cold start timeout issue
- All 43 symbols are being checked correctly
- Execution timing is correct (every minute on schedule)
- Go server is returning data correctly (not the issue)

---

## Files Involved

**Bug Location:**
- `apps/app/src/services/traderManager.ts:360` (serializeTrader method)

**Impact Points:**
- `supabase/functions/execute-trader/index.ts:185-222` (trader fetch and execution)
- `supabase/functions/trigger-executions/index.ts:52-89` (trader fetch)

**Test Files Needed:**
- Edge Function integration tests
- Database schema validation tests