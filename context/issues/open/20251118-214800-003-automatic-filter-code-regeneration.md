# Automatic Filter Code Regeneration on Errors

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-18 21:48:00

## Context

When trader filter code fails, we should automatically attempt to fix it using LLM regeneration. The LLM will receive:
- Original filter code that failed
- Error message and stack trace
- Execution context (symbols, timeframes, etc.)
- Original user strategy description

The regenerated code should be stored as a "proposed fix" for user review, not automatically deployed.

## Linked Items

- Part of: `context/issues/open/20251118-214800-000-PROJECT-trader-error-recovery-system.md`
- Depends on: `context/issues/open/20251118-214800-001-persist-trader-execution-errors.md`

## Progress

Not started.

## Spec

### Trigger Mechanism

**Option 1: Database Trigger (Recommended)**
```sql
-- Trigger on trader_execution_errors insert
CREATE OR REPLACE FUNCTION trigger_filter_code_regeneration()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger if not already regenerating
  IF NEW.auto_regeneration_triggered = false THEN
    -- Call Edge Function via pg_net
    PERFORM net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/regenerate-filter-code',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
      ),
      body := jsonb_build_object(
        'error_id', NEW.id,
        'trader_id', NEW.trader_id
      )
    );

    -- Mark as triggered
    NEW.auto_regeneration_triggered = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER filter_code_regeneration_trigger
BEFORE INSERT ON trader_execution_errors
FOR EACH ROW
WHEN (NEW.error_type IN ('compilation', 'runtime', 'panic'))
EXECUTE FUNCTION trigger_filter_code_regeneration();
```

### Supabase Edge Function

Create `supabase/functions/regenerate-filter-code/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { initBraintrust } from '../_shared/braintrust.ts'

interface RegenerationRequest {
  error_id: string
  trader_id: string
}

serve(async (req) => {
  const { error_id, trader_id }: RegenerationRequest = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // 1. Fetch error details
  const { data: error, error: errorFetchErr } = await supabase
    .from('trader_execution_errors')
    .select('*')
    .eq('id', error_id)
    .single()

  if (errorFetchErr) {
    return new Response(`Error not found: ${errorFetchErr.message}`, { status: 404 })
  }

  // 2. Fetch trader details (original strategy, config)
  const { data: trader, error: traderFetchErr } = await supabase
    .from('traders')
    .select('*')
    .eq('id', trader_id)
    .single()

  if (traderFetchErr) {
    return new Response(`Trader not found: ${traderFetchErr.message}`, { status: 404 })
  }

  // 3. Check rate limit: max 3 regeneration attempts per error
  if (error.regeneration_count >= 3) {
    console.log(`[RegenerateFilterCode] Max regeneration attempts reached for error ${error_id}`)
    return new Response('Max regeneration attempts reached', { status: 429 })
  }

  // 4. Initialize Braintrust for tracing
  const braintrust = await initBraintrust()
  const logger = braintrust.logger({
    projectName: 'ai-trader',
    experiment: 'filter-code-regeneration'
  })

  // 5. Get regeneration prompt from Braintrust
  const regeneratePromptResult = await braintrust.getPrompt({
    slug: 'regenerate-filter-go',
    version: 'latest'
  })

  if (!regeneratePromptResult) {
    return new Response('Regeneration prompt not found in Braintrust', { status: 500 })
  }

  const regeneratePrompt = regeneratePromptResult.prompt

  // 6. Build prompt context
  const promptContext = {
    original_strategy: trader.strategy.description,
    failed_code: error.filter_code_snapshot,
    error_type: error.error_type,
    error_message: error.error_message,
    stack_trace: error.stack_trace,
    execution_context: {
      trigger_interval: error.trigger_interval,
      symbols_processed: error.symbols_processed,
      execution_duration_ms: error.execution_duration_ms
    },
    indicators: trader.strategy.indicators,
    timeframes: trader.filter.timeframes
  }

  // 7. Call LLM via Firebase AI Logic (with Braintrust tracing)
  const span = logger.startSpan({
    name: 'regenerate-filter-code',
    input: promptContext
  })

  try {
    // Call Firebase AI Logic Gemini endpoint
    const response = await fetch(
      `https://firebasevertexai.googleapis.com/v1beta/projects/${Deno.env.get('FIREBASE_PROJECT_ID')}/locations/us-central1/publishers/google/models/gemini-2.0-flash-thinking-exp-01-21:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('FIREBASE_ACCESS_TOKEN')}`
        },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{
              text: regeneratePrompt.format(promptContext)
            }]
          }],
          generationConfig: {
            temperature: 0.3,  // Lower temp for more deterministic fixes
            maxOutputTokens: 4096
          }
        })
      }
    )

    const result = await response.json()
    const regeneratedCode = extractCode(result)

    span.log({
      output: { regenerated_code: regeneratedCode }
    })
    span.end()

    // 8. Validate regenerated code (compile check)
    const validation = await validateGoCode(regeneratedCode)
    if (!validation.valid) {
      console.error(`[RegenerateFilterCode] Generated invalid code: ${validation.error}`)
      span.log({
        error: `Code validation failed: ${validation.error}`
      })

      // Still save it for manual review
    }

    // 9. Save regenerated code as proposed fix
    const { error: updateErr } = await supabase
      .from('trader_execution_errors')
      .update({
        proposed_fix_code: regeneratedCode,
        proposed_fix_validated: validation.valid,
        regeneration_count: error.regeneration_count + 1,
        regenerated_at: new Date().toISOString()
      })
      .eq('id', error_id)

    if (updateErr) {
      throw new Error(`Failed to save proposed fix: ${updateErr.message}`)
    }

    // 10. Log to Braintrust
    await logger.flush()

    return new Response(JSON.stringify({
      success: true,
      error_id,
      regeneration_count: error.regeneration_count + 1,
      code_validated: validation.valid
    }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('[RegenerateFilterCode] Error:', err)
    span.log({ error: err.message })
    span.end()
    await logger.flush()

    return new Response(JSON.stringify({
      error: err.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})

// Extract Go code from LLM response
function extractCode(response: any): string {
  const content = response.candidates[0].content.parts[0].text
  const match = content.match(/```go\n([\s\S]+?)\n```/)
  return match ? match[1] : content
}

// Validate Go code by calling Go backend validation endpoint
async function validateGoCode(code: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch(`${Deno.env.get('GO_BACKEND_URL')}/api/validate-filter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    })

    if (!response.ok) {
      return { valid: false, error: await response.text() }
    }

    return { valid: true }
  } catch (err) {
    return { valid: false, error: err.message }
  }
}
```

### Database Schema Updates

Add columns to `trader_execution_errors`:

```sql
ALTER TABLE trader_execution_errors ADD COLUMN proposed_fix_code TEXT;
ALTER TABLE trader_execution_errors ADD COLUMN proposed_fix_validated BOOLEAN DEFAULT false;
ALTER TABLE trader_execution_errors ADD COLUMN regenerated_at TIMESTAMPTZ;
ALTER TABLE trader_execution_errors ADD COLUMN fix_applied_at TIMESTAMPTZ;
ALTER TABLE trader_execution_errors ADD COLUMN fix_applied_by UUID REFERENCES auth.users(id);
```

### Regeneration Prompt

Create `backend/go-screener/prompts/regenerate-filter-go.md`:

```markdown
# Regenerate Go Filter Code

You are a Go expert specializing in fixing trading filter code that has failed.

## Original Strategy
{original_strategy}

## Failed Code
```go
{failed_code}
```

## Error Details
- **Type**: {error_type}
- **Message**: {error_message}
- **Stack Trace**:
```
{stack_trace}
```

## Execution Context
- Trigger Interval: {execution_context.trigger_interval}
- Symbols Processed: {execution_context.symbols_processed}
- Execution Duration: {execution_context.execution_duration_ms}ms

## Requirements
- Fix the error while maintaining the original strategy intent
- Use the correct indicators: {indicators}
- Use timeframes: {timeframes}
- Follow Go best practices
- Keep code simple and efficient
- Add defensive nil checks where needed

## Output Format
Provide ONLY the corrected Go code in a ```go code block, no explanation.
```

Upload to Braintrust:
```bash
deno run --allow-net --allow-read --allow-env scripts/upload-all-prompts-to-braintrust.ts
```

### Go Backend Validation Endpoint

Add to `backend/go-screener/internal/server/handlers.go`:

```go
// ValidateFilterHandler validates filter code without executing it
func (s *Server) ValidateFilterHandler(w http.ResponseWriter, r *http.Request) {
    var req struct {
        Code string `json:"code"`
    }

    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    if err := s.yaegi.ValidateCode(req.Code); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    w.WriteHeader(http.StatusOK)
}
```

### Rate Limiting & Cost Control

- Max 3 regeneration attempts per error
- Track LLM costs per user in metrics
- Alert if regeneration costs exceed $10/day per user
- Exponential backoff: 0s, 5m, 30m between attempts

### Testing Strategy

1. **Unit tests**: Prompt formatting, code extraction
2. **Integration tests**: End-to-end regeneration flow
3. **LLM evaluation**: Braintrust evals on common error types
4. **Load tests**: 100 concurrent regeneration requests

### Metrics to Track

- `filter_regeneration_attempts_total{error_type}`
- `filter_regeneration_success_total`
- `filter_regeneration_failures_total`
- `filter_regeneration_duration_seconds`
- `filter_regeneration_llm_cost_usd`

### Acceptance Criteria

- ✅ Regeneration triggered within 5 seconds of error
- ✅ Code validated before saving as proposed fix
- ✅ Full Braintrust tracing for debugging
- ✅ Rate limiting prevents infinite loops
- ✅ Cost tracking per user
- ✅ 70%+ success rate on common errors (based on evals)
