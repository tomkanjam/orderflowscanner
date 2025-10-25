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

**⏳ BLOCKING ISSUE #1 - Braintrust Metrics Validation Error:**

llm-proxy returning HTTP 500 due to Braintrust metrics validation failure.

**Root Cause:** span.log() was logging non-numeric `decision` field in metrics object
**Fix:** Removed `decision` from metrics (Braintrust only accepts numbers)
**Result:** Redeployed llm-proxy (version 38), HTTP 200 responses confirmed

### 2025-10-25 [CURRENT SESSION] - Database Write Fixed

**⏳ BLOCKING ISSUE #2 - Database Write Failing Silently:**

llm-proxy returning HTTP 200 but zero analyses in signal_analyses table.

**Root Cause Investigation:**
- Checked table schema: `signal_analyses` requires NOT NULL fields `trader_id` and `user_id`
- analyzeSignal.ts was only inserting `signal_id` (missing required fields)
- Also attempting to insert `metadata` field which doesn't exist in table
- Metadata fields need to be mapped to individual columns: `raw_ai_response`, `analysis_latency_ms`, `gemini_tokens_used`, `model_name`

**✅ Fixed:**
1. ✅ Added `trader_id` and `user_id` to database insert payload
2. ✅ Mapped metadata object to individual table columns
3. ✅ Redeployed llm-proxy (version 39)
4. ✅ Verified: 20 analyses successfully written to signal_analyses table

**Evidence of Success:**
```sql
SELECT COUNT(*) FROM signal_analyses;
-- Result: 20 (previously 0)
```

**Sample Analysis Data:**
- Decision: wait
- Confidence: 60%
- Model: google/gemini-2.5-flash
- Tokens: ~1100 per analysis
- Latency: 3.7-4.1 seconds per analysis
- All required fields populated: signal_id, trader_id, user_id, decision, confidence, reasoning, key_levels, trade_plan

**End-to-End Verification:**
```sql
-- Verified: Only traders with auto_analyze_signals=true get analyses
Trader "Three Red Candles Short" (auto_analyze_signals=true): 3/3 signals analyzed ✓
Trader "Three Green Candles 1m" (auto_analyze_signals=false): 0/7 signals analyzed ✓
```

**✅ ISSUE RESOLVED - Auto-Trigger Working End-to-End:**

Complete flow now operational:
1. ✅ Signal INSERT → Database trigger fires
2. ✅ Trigger calls /llm-proxy with analyze-signal operation
3. ✅ llm-proxy → OpenRouter API → Gemini 2.5 Flash
4. ✅ Braintrust tracing captures full execution
5. ✅ Analysis written to signal_analyses table
6. ✅ Only Elite tier + auto_analyze_signals=true traders

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
## Completion

**Closed:** 2025-10-25 09:35:29
**Outcome:** Success
**Commits:** 
- 053fafa - Initial implementation (llm-proxy analyze-signal operation, migration 028, Braintrust prompt)
- 03db32b - Fixed database write (added trader_id/user_id, mapped metadata fields)

**Final Status:**
Auto-trigger AI analysis working end-to-end with full Braintrust observability. All success criteria met.

