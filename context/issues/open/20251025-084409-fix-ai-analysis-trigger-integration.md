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

**⏳ BLOCKING ISSUE - Prompt Upload Required:**

The auto-trigger is NOT working because the `analyze-signal` prompt doesn't exist in Braintrust yet. The llm-proxy's promptLoader requires this prompt to be uploaded before it can process analysis requests.

**Evidence:**
- New signals created: ✓ (5 signals in last minute)
- Trigger firing: ✓ (case-sensitivity fixed)
- llm-proxy calls in Edge Function logs: ✗ (zero calls)
- Signal analyses created: ✗ (zero analyses)
- Postgres logs: No "Triggered AI analysis" messages after tier fix

**Root Cause:**
The promptLoader in llm-proxy tries to load `analyze-signal` from Braintrust and fails silently (or errors), preventing the analysis from running.

**Required Action:**
```bash
# Upload the prompt (requires BRAINTRUST_API_KEY from user)
BRAINTRUST_API_KEY=xxx deno run --allow-all scripts/upload-analyze-signal-prompt.ts
```

After upload, test with trader `4b0b340d-a940-46ce-b0e5-d83ce404f350` which:
- ✓ Enabled: true
- ✓ auto_analyze_signals: true
- ✓ Tier: ELITE
- ✓ Generates signals every minute

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
