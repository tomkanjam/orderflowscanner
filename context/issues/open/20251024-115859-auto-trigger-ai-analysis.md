# Auto-Trigger AI Analysis for New Signals

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-10-24 11:58:59

## Context

Currently, AI analysis is NOT being automatically triggered when new signals are created. The `execute-trader` Edge Function creates signals in the `trader_signals` table and broadcasts to Realtime, but does not trigger AI analysis.

This breaks the end-to-end workflow for Elite tier users who should get automatic AI analysis on every signal.

**Current State:**
- ✅ Signals are created and stored in `trader_signals` table
- ✅ Realtime broadcasts work
- ❌ No automatic AI analysis trigger
- ❌ `ai-analysis` Edge Function exists but must be called manually

**Expected State:**
- ✅ Elite tier signals automatically trigger AI analysis
- ✅ Analysis results stored in `signal_analyses` table
- ✅ Non-blocking (doesn't slow down signal creation)
- ✅ Tier-aware (only Elite users get auto-analysis)

## Linked Items
- Part of: End-to-end trader workflow implementation initiative
- Related: `supabase/functions/execute-trader/index.ts:266-294`
- Related: `supabase/functions/ai-analysis/index.ts`
- Related: `supabase/migrations/014_create_signal_analyses_table.sql`

## Progress

### 2025-10-24 12:00 - Implementation Complete

**✅ Completed:**
1. Created migration `023_add_trader_automation_toggles.sql` - Adds `auto_analyze_signals` and `auto_execute_trades` columns
2. Created migration `024_auto_trigger_ai_analysis.sql` - Database trigger with tier + toggle checking
3. Updated `TraderForm.tsx` - Added UI toggle controls (Elite tier only)
4. Updated `trader.interfaces.ts` - Added TypeScript types for automation toggles
5. Created `APPLY_MIGRATIONS.md` - Manual migration guide (requires Dashboard access)

**⏳ Pending:**
- Apply migrations via Supabase Dashboard (manual step - see APPLY_MIGRATIONS.md)
- Set Supabase secrets (`app.service_role_key`, `app.supabase_url`)
- Test with Elite tier trader (toggle OFF → no analysis, toggle ON → analysis triggered)

**Files Modified:**
- `supabase/migrations/023_add_trader_automation_toggles.sql` (new)
- `supabase/migrations/024_auto_trigger_ai_analysis.sql` (new)
- `apps/app/src/components/TraderForm.tsx` (toggle UI + state)
- `apps/app/src/abstractions/trader.interfaces.ts` (TypeScript types)
- `APPLY_MIGRATIONS.md` (migration guide)

## Spec

### Solution: Database Trigger + Per-Trader Toggle Controls

Implement a Postgres trigger that automatically calls the `ai-analysis` Edge Function when a new signal is inserted into `trader_signals`, BUT only if the trader has analysis enabled.

**User Controls (Progressive Automation):**
1. **Signal Creation:** Always enabled when trader is enabled
2. **Signal Analysis:** Toggle per trader (default: OFF) - Elite tier only
3. **Trade Execution:** Toggle per trader (default: OFF) - Future feature

**Why Database Trigger:**
- ✅ Transactional consistency with signal creation
- ✅ Automatic retries via Postgres reliability
- ✅ Survives Edge Function restarts/deployments
- ✅ Separation of concerns (declarative, not imperative)
- ✅ Built-in tier + toggle checking
- ✅ Auditability via Postgres logs
- ✅ Non-blocking via pg_net async HTTP

### Implementation Steps

#### 1. Add Toggle Columns to Traders Table
`supabase/migrations/023_add_trader_automation_toggles.sql`

```sql
-- Add automation toggle columns to traders table
ALTER TABLE traders
ADD COLUMN IF NOT EXISTS auto_analyze_signals BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_execute_trades BOOLEAN DEFAULT false;

-- Add indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_traders_auto_analyze ON traders(auto_analyze_signals) WHERE auto_analyze_signals = true;
CREATE INDEX IF NOT EXISTS idx_traders_auto_execute ON traders(auto_execute_trades) WHERE auto_execute_trades = true;

-- Add comments for documentation
COMMENT ON COLUMN traders.auto_analyze_signals IS 'When true, automatically trigger AI analysis for new signals (Elite tier only)';
COMMENT ON COLUMN traders.auto_execute_trades IS 'When true, automatically execute trades based on AI analysis (Elite tier only, requires auto_analyze_signals=true)';
```

#### 2. Create Auto-Trigger Migration File
`supabase/migrations/024_auto_trigger_ai_analysis.sql`

```sql
-- Enable pg_net extension for async HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function to trigger AI analysis for new signals
CREATE OR REPLACE FUNCTION trigger_ai_analysis_on_signal()
RETURNS TRIGGER AS $$
DECLARE
  trader_record RECORD;
  analysis_payload JSONB;
  edge_function_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Get trader details with user subscription tier
  SELECT
    t.*,
    COALESCE(up.subscription_tier, 'anonymous') as subscription_tier
  INTO trader_record
  FROM traders t
  LEFT JOIN user_profiles up ON t.user_id = up.id
  WHERE t.id = NEW.trader_id;

  -- Check 1: Only Elite tier users
  IF trader_record.subscription_tier != 'elite' THEN
    RAISE LOG 'Skipping AI analysis for trader % - tier: %',
      NEW.trader_id, trader_record.subscription_tier;
    RETURN NEW;
  END IF;

  -- Check 2: Only if trader has auto_analyze_signals enabled
  IF trader_record.auto_analyze_signals != true THEN
    RAISE LOG 'Skipping AI analysis for trader % - auto_analyze_signals is disabled',
      NEW.trader_id;
    RETURN NEW;
  END IF;

  -- Get Edge Function URL from Supabase Vault
  SELECT decrypted_secret INTO edge_function_url
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_url';

  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    RAISE WARNING 'supabase_url not found in vault - cannot trigger AI analysis';
    RETURN NEW;
  END IF;
  edge_function_url := edge_function_url || '/functions/v1/ai-analysis';

  -- Get service role key from Supabase Vault
  SELECT decrypted_secret INTO service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key';

  IF service_role_key IS NULL OR service_role_key = '' THEN
    RAISE WARNING 'service_role_key not found in vault - cannot trigger AI analysis';
    RETURN NEW;
  END IF;

  -- Build request payload
  analysis_payload := jsonb_build_object(
    'signalId', NEW.id,
    'symbol', (NEW.symbols)[1], -- First symbol in array
    'strategy', jsonb_build_object(
      'instructions', (trader_record.strategy->>'instructions'),
      'modelTier', (trader_record.strategy->>'modelTier')
    ),
    'traderId', NEW.trader_id,
    'userId', trader_record.user_id,
    'timestamp', NEW.timestamp
  );

  -- Make async HTTP POST to ai-analysis Edge Function
  PERFORM net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := analysis_payload,
    timeout_milliseconds := 30000 -- 30 second timeout
  );

  RAISE LOG 'Triggered AI analysis for signal % (trader: %, symbol: %)',
    NEW.id, NEW.trader_id, (NEW.symbols)[1];

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail signal creation
    RAISE WARNING 'Failed to trigger AI analysis for signal %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on trader_signals INSERT
DROP TRIGGER IF EXISTS auto_trigger_ai_analysis ON trader_signals;
CREATE TRIGGER auto_trigger_ai_analysis
  AFTER INSERT ON trader_signals
  FOR EACH ROW
  EXECUTE FUNCTION trigger_ai_analysis_on_signal();

-- Add comment for documentation
COMMENT ON FUNCTION trigger_ai_analysis_on_signal() IS
  'Automatically triggers AI analysis via Edge Function for Elite tier signals';
COMMENT ON TRIGGER auto_trigger_ai_analysis ON trader_signals IS
  'Auto-triggers AI analysis for new signals (Elite tier only)';
```

#### 2. Update ai-analysis Edge Function (Optional Enhancement)

Add trigger context logging in `supabase/functions/ai-analysis/index.ts`:

```typescript
// After line 44 (after parsing request)
const triggerSource = req.headers.get('x-trigger-source') || 'manual';
console.log(`[${correlationId}] Analysis triggered via: ${triggerSource}`);
```

Modify trigger to add header:

```sql
-- In trigger function, add to headers:
headers := jsonb_build_object(
  'Content-Type', 'application/json',
  'Authorization', 'Bearer ' || service_role_key,
  'x-trigger-source', 'database-trigger',
  'x-correlation-id', NEW.id::text
)
```

#### 4. Update TraderForm UI

Add toggle controls in `apps/app/src/components/TraderForm.tsx`:

```typescript
// Add to state (around line 40)
const [autoAnalyzeSignals, setAutoAnalyzeSignals] = useState(
  editingTrader?.auto_analyze_signals || false
);
const [autoExecuteTrades, setAutoExecuteTrades] = useState(
  editingTrader?.auto_execute_trades || false
);

// Add to form UI (after Advanced Settings section)
{currentTier === 'elite' && (
  <div className="space-y-4 border-t pt-4">
    <h3 className="font-medium">Automation Settings</h3>

    {/* Auto-analyze signals toggle */}
    <label className="flex items-center space-x-2">
      <input
        type="checkbox"
        checked={autoAnalyzeSignals}
        onChange={(e) => setAutoAnalyzeSignals(e.target.checked)}
        className="rounded"
      />
      <div>
        <div className="font-medium">Auto-Analyze Signals</div>
        <div className="text-sm text-gray-500">
          Automatically run AI analysis on every signal (Elite only)
        </div>
      </div>
    </label>

    {/* Auto-execute trades toggle (disabled for now) */}
    <label className="flex items-center space-x-2 opacity-50">
      <input
        type="checkbox"
        checked={autoExecuteTrades}
        disabled={!autoAnalyzeSignals}
        className="rounded"
      />
      <div>
        <div className="font-medium">Auto-Execute Trades</div>
        <div className="text-sm text-gray-500">
          Automatically execute trades based on AI analysis (Coming soon)
        </div>
      </div>
    </label>
  </div>
)}

// Include in trader creation payload
const traderData = {
  ...
  auto_analyze_signals: autoAnalyzeSignals,
  auto_execute_trades: false // Always false for now
};
```

#### 3. Testing

**Unit Test (SQL):**
```sql
-- Test 1: Elite tier + toggle ON → should trigger
INSERT INTO trader_signals (trader_id, symbols, timestamp)
VALUES (
  '<elite-tier-trader-id-with-auto-analyze-on>',
  ARRAY['BTCUSDT'],
  NOW()
);
-- Expected: Trigger fires, analysis called

-- Test 2: Elite tier + toggle OFF → should NOT trigger
INSERT INTO trader_signals (trader_id, symbols, timestamp)
VALUES (
  '<elite-tier-trader-id-with-auto-analyze-off>',
  ARRAY['ETHUSDT'],
  NOW()
);
-- Expected: Trigger skips, logs "auto_analyze_signals is disabled"

-- Test 3: Non-Elite tier → should NOT trigger
INSERT INTO trader_signals (trader_id, symbols, timestamp)
VALUES (
  '<pro-tier-trader-id>',
  ARRAY['BNBUSDT'],
  NOW()
);
-- Expected: Trigger skips, logs tier check failure
```

**Integration Test:**
1. Create Elite tier trader via TraderForm
2. **Leave auto_analyze_signals OFF (default)**
3. Enable trader, wait for signal
4. Verify signal created but NO analysis triggered
5. **Toggle auto_analyze_signals ON** via UI
6. Wait for next signal
7. Verify analysis triggered automatically
8. Check `signal_analyses` table for result

**Edge Cases:**
- Non-Elite tier → should NOT trigger analysis (tier check)
- Elite tier + toggle OFF → should NOT trigger analysis (toggle check)
- Elite tier + toggle ON → SHOULD trigger analysis
- Missing trader → should log warning, not fail
- Edge Function timeout → should log warning, not fail
- Invalid payload → should log error, continue

#### 4. Monitoring

**Add to Grafana/Observability:**
- Trigger execution count (via Postgres logs)
- Analysis success rate (signal_analyses inserts / trigger fires)
- Average latency (trigger → analysis completion)
- Failed analysis count (check Edge Function errors)
- Traders with auto_analyze_signals enabled (gauge metric)

**Postgres Queries:**
```sql
-- Count auto-triggered analyses today
SELECT COUNT(*)
FROM signal_analyses
WHERE created_at > CURRENT_DATE;

-- Find Elite traders with auto-analysis enabled
SELECT t.id, t.name, up.subscription_tier, t.auto_analyze_signals
FROM traders t
JOIN user_profiles up ON t.user_id = up.id
WHERE up.subscription_tier = 'elite'
  AND t.auto_analyze_signals = true
  AND t.enabled = true;

-- Find signals without analysis (where they should have been triggered)
SELECT s.*, t.name as trader_name
FROM trader_signals s
JOIN traders t ON s.trader_id = t.id
JOIN user_profiles up ON t.user_id = up.id
WHERE up.subscription_tier = 'elite'
  AND t.auto_analyze_signals = true
  AND s.created_at > NOW() - INTERVAL '24 hours'
  AND NOT EXISTS (
    SELECT 1 FROM signal_analyses sa WHERE sa.signal_id = s.id
  );

-- Count signals by automation status
SELECT
  CASE
    WHEN t.auto_analyze_signals THEN 'auto-analysis-enabled'
    ELSE 'manual-only'
  END as mode,
  COUNT(*) as signal_count
FROM trader_signals s
JOIN traders t ON s.trader_id = t.id
WHERE s.created_at > CURRENT_DATE
GROUP BY t.auto_analyze_signals;
```

### Rollback Plan

If trigger causes issues:

```sql
-- Disable trigger
DROP TRIGGER IF EXISTS auto_trigger_ai_analysis ON trader_signals;

-- Or just disable without dropping
ALTER TABLE trader_signals DISABLE TRIGGER auto_trigger_ai_analysis;

-- Re-enable later
ALTER TABLE trader_signals ENABLE TRIGGER auto_trigger_ai_analysis;
```

### Performance Considerations

- **Non-blocking:** pg_net makes async HTTP call (doesn't block INSERT)
- **Timeout:** 30s max (won't hang signal creation)
- **Error handling:** Exceptions logged but don't fail signal creation
- **Concurrency:** Postgres handles multiple signals simultaneously
- **Rate limiting:** Consider if >100 signals/sec (unlikely for MVP)

### Security Considerations

- ✅ Service role key stored in Postgres secrets (not in code)
- ✅ Trigger runs as SECURITY DEFINER (elevated privileges)
- ✅ Tier checking prevents unauthorized analysis
- ✅ Toggle checking prevents unwanted automation
- ✅ RLS policies still enforced on ai-analysis Edge Function
- ✅ No user input in trigger (only database values)
- ✅ Users control automation per trader (opt-in, not opt-out)

### User Experience Flow

**Default Behavior (Safe):**
1. User creates trader → auto_analyze_signals = false
2. Signals are created when conditions match
3. **No automatic analysis** (user must trigger manually)

**Enabling Automation (Opt-in):**
1. User toggles "Auto-Analyze Signals" ON in TraderForm
2. Future signals automatically trigger AI analysis
3. User can toggle OFF anytime to disable automation

**Progressive Automation Path:**
```
Tier: Free/Pro → No automation (not allowed)
  ↓
Tier: Elite → Can enable auto-analysis (default OFF)
  ↓
Enable auto-analysis → Signals automatically analyzed
  ↓
[Future] Enable auto-execution → Trades automatically executed
```

**Safety Features:**
- ✅ Default OFF (prevents accidental automation)
- ✅ Elite-only (prevents abuse)
- ✅ Per-trader control (granular)
- ✅ Can disable anytime (reversible)
- ✅ Future auto-execution requires auto-analysis (dependency check)

## Completion
(Add this section when closing the issue)
**Closed:** YYYY-MM-DD HH:mm:ss
**Outcome:** [Success|Abandoned|Merged into X]
**Commits:** [list relevant commit hashes]
