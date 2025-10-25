# Fix AI Analysis Auto-Trigger Integration

**Type:** bug
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-10-25 08:44:09

## Context

The auto-trigger database trigger (migration 024) is calling the `/ai-analysis` Edge Function, but there are TWO critical problems:

1. **Wrong architecture**: `ai-analysis` uses direct Gemini API (no OpenRouter, no Braintrust instrumentation)
2. **Wrong endpoint**: Should call `/llm-proxy` with operation="analyze-signal" for full observability

**Current Flow (BROKEN):**
```
signals INSERT → trigger → ai-analysis Edge Function → Gemini API directly → No tracing ❌
```

**Expected Flow:**
```
signals INSERT → trigger → llm-proxy Edge Function → OpenRouter → Braintrust tracing ✅
```

**Why This Matters:**
- Can't see analysis quality in Braintrust
- Can't A/B test prompts
- Can't measure token usage/costs
- Inconsistent with rest of LLM pipeline
- Against project architecture (issue 20251024-110600-002)

## Linked Items
- Part of: `context/issues/open/20251024-110600-000-PROJECT-complete-braintrust-integration.md`
- Blocks: Auto-trigger working end-to-end
- Related: `context/issues/open/20251024-110600-002-unify-signal-analysis.md` (migrate ai-analysis to llm-proxy)

## Progress

### 2025-10-25 08:50 - Implementation Complete (Code)

**✅ Completed:**
1. Added `analyze-signal` operation to llm-proxy config (operations.ts)
2. Created analyzeSignal operation handler with full Braintrust tracing
3. Registered handler in llm-proxy index.ts routing
4. Created analysis prompt template (prompts/analyze-signal.md)
5. Created migration 028 to update trigger endpoint and payload
6. Created Braintrust prompt upload script
7. Committed all changes (commit: 053fafa)

### 2025-10-25 08:55 - Deployment Complete

**✅ Deployed:**
1. ✅ llm-proxy Edge Function deployed to Supabase (project: jtpqkbybuxbcvqeffmtf)
2. ✅ Migration 028 applied successfully via MCP tool
3. ✅ Trigger now calling `/llm-proxy` with `analyze-signal` operation

### 2025-10-25 09:01 - Fixed Case-Sensitive Tier Checking

**✅ Additional Fix:**
1. ✅ Fixed subscription tier case sensitivity issue (ELITE vs elite)
   - Updated trigger to use `LOWER(up.subscription_tier)` for comparison
   - Trigger now properly detects Elite tier users

### 2025-10-25 09:25 - Prompt Uploaded, Database Write Added

**✅ Completed:**
1. ✅ Uploaded `analyze-signal` prompt to Braintrust successfully
2. ✅ Updated BRAINTRUST_API_KEY secret with new key
3. ✅ Added database write capability to analyzeSignal operation (stores to signal_analyses table)
4. ✅ Redeployed llm-proxy (version 37)

**⏳ BLOCKING ISSUE - llm-proxy Returning 500 Errors:**

The auto-trigger is firing but llm-proxy is returning HTTP 500 errors consistently.

**Evidence:**
- New signals created: ✓ (signals generating every minute)
- Trigger firing: ✓ (case-sensitivity fixed, tier check working)
- llm-proxy calls: ✓ (many POST requests to /llm-proxy)
- llm-proxy responses: ✗ (HTTP 500, execution time 3-7 seconds)
- Signal analyses created: ✗ (zero analyses in signal_analyses table)

**Execution Pattern:**
- 3-7 second execution time suggests reaching OpenRouter API call stage
- Consistent 500 errors across all requests (version 37)
- No detailed error logs accessible via CLI

**Possible Causes:**
1. OpenRouter API call failing (wrong model ID, API key issue, etc.)
2. JSON response parsing failing
3. Database write failing after successful analysis
4. Parameter mismatch in openRouterClient.generateStructuredResponse() call

**Next Steps:**
- Need to see detailed Edge Function console logs to identify exact error
- Or add more robust error logging/handling in analyzeSignal operation

**Files Modified:**
- `supabase/functions/llm-proxy/config/operations.ts` - Added analyze-signal config
- `supabase/functions/llm-proxy/index.ts` - Registered analyze-signal handler
- `supabase/functions/llm-proxy/operations/analyzeSignal.ts` - New operation handler
- `supabase/functions/llm-proxy/prompts/analyze-signal.md` - Prompt template
- `supabase/migrations/028_update_trigger_to_use_llm_proxy.sql` - Updated trigger
- `scripts/upload-analyze-signal-prompt.ts` - Braintrust upload utility

## Spec

**Solution: Update trigger to call llm-proxy instead of ai-analysis**

### Step 1: Check if llm-proxy has analyze-signal operation

Check `/supabase/functions/llm-proxy/config/operations.ts` for `analyze-signal` operation.

If NOT present → Implement it first (from issue 20251024-110600-002)
If present → Skip to Step 2

### Step 2: Understand llm-proxy payload format

The llm-proxy expects:
```typescript
POST /llm-proxy
{
  "operation": "analyze-signal",
  "params": {
    // What params does analyze-signal expect?
  }
}
```

Check the operation handler to understand expected params.

### Step 3: Update database trigger

Modify `supabase/migrations/024_auto_trigger_ai_analysis.sql`:

**Change URL:**
```sql
-- OLD
edge_function_url := edge_function_url || '/functions/v1/ai-analysis';

-- NEW
edge_function_url := edge_function_url || '/functions/v1/llm-proxy';
```

**Change Payload:**
```sql
-- OLD
analysis_payload := jsonb_build_object(
  'signalId', NEW.id,
  'symbol', (NEW.symbols)[1],
  'strategy', jsonb_build_object(...),
  'traderId', NEW.trader_id,
  'userId', trader_record.user_id,
  'timestamp', NEW.timestamp,
  'triggerSource', 'database-trigger'
);

-- NEW
analysis_payload := jsonb_build_object(
  'operation', 'analyze-signal',
  'params', jsonb_build_object(
    'signalId', NEW.id,
    'symbol', NEW.symbol,  -- Note: signals table has single symbol, not array
    'traderId', NEW.trader_id,
    'userId', trader_record.user_id,
    'timestamp', NEW.timestamp,
    'price', NEW.price_at_signal,
    'strategy', trader_record.strategy  -- Full strategy object
  )
);
```

**Important Notes:**
- `signals` table has `symbol` (string), NOT `symbols` (array) - trigger was wrong
- `signals` table has `price_at_signal` which should be passed
- `signals` table does NOT have klines/indicators - llm-proxy must fetch them or analyze without them

### Step 4: Create migration to apply changes

Create `supabase/migrations/028_update_trigger_to_use_llm_proxy.sql`:
- Drop and recreate trigger function with new URL + payload
- Add comments documenting the change

### Step 5: Verify analyze-signal operation exists

If analyze-signal operation doesn't exist in llm-proxy, we need to:
1. Create `/supabase/functions/llm-proxy/operations/analyzeSignal.ts`
2. Add to `operations.ts` config
3. Upload prompt to Braintrust

### Testing

**Test Plan:**
1. Enable auto_analyze_signals for test trader
2. Wait for signal to be created (or manually insert one)
3. Check Supabase logs for trigger execution
4. Check Braintrust dashboard for trace
5. Verify `signal_analyses` table has new row
6. Verify analysis quality

**Success Criteria:**
- Trigger calls llm-proxy ✓
- llm-proxy routes to analyze-signal operation ✓
- OpenRouter API called ✓
- Braintrust trace captured ✓
- Analysis stored in signal_analyses table ✓
- End-to-end latency <10s ✓

## Notes

**Payload Limitation:**
The `signals` table doesn't store klines/calculatedIndicators. Two options:

**Option A (Simple):** Pass only signal data, let llm-proxy fetch klines from Binance
**Option B (Complex):** Update Go backend to store signal_data JSONB with full market context

Recommend Option A for MVP - llm-proxy can fetch recent klines for the symbol.
