# Implement Position Management Workflow

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-10-25 10:29:27

## Context

When a position is opened (either from immediate entry or after setup monitoring), we need to actively manage it at EVERY candle close until the position is fully closed. This includes adjusting SL/TP, scaling out, or closing the position based on AI analysis.

**Current:** Positions opened but not managed
**Needed:** Position opened → manage at every candle close → close position

This is ALWAYS ACTIVE for open positions (unlike setup monitoring which is conditional).

## Linked Items

- Part of: `context/issues/open/20251025-102927-000-PROJECT-continuous-monitoring-system.md`
- Depends on: `context/issues/open/20251025-102927-001-enable-candle-close-events.md`
- Depends on: Trade execution system (positions table, order execution)
- Related: CCXT integration for position/order management

## Progress

*Track progress here*

## Spec

### Architecture Flow

```
Position Opened (via trade execution)
        ↓
PostgreSQL NOTIFY → "start_position_management"
        ↓
Go Management Engine receives notification
        ↓
Create PositionManagementState in registry
        ↓
Subscribe to candle_close events for this symbol/interval
        ↓
[Candle Close Event] triggered
        ↓
Fetch current position state (P&L, size, SL/TP)
        ↓
HTTP POST to llm-proxy (manage-position operation) [NEW OPERATION]
        ↓
Store management decision in position_management_decisions table
        ↓
Execute management action:
    - hold: Do nothing
    - adjust_sl: Modify stop loss order
    - adjust_tp: Modify take profit order
    - reduce: Partial exit (scale out)
    - close: Full exit
        ↓
Check if position closed
        ↓ YES
Stop management workflow
```

### Implementation Steps

#### Step 1: Database Schema

Create migration: `supabase/migrations/030_position_management.sql`

```sql
-- Table for position management decisions
CREATE TABLE position_management_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL,
  signal_id UUID REFERENCES signals(id) ON DELETE SET NULL,
  trader_id UUID NOT NULL,
  user_id UUID NOT NULL,

  -- Position state at decision time
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_pnl DECIMAL NOT NULL,
  current_pnl_pct DECIMAL NOT NULL,
  position_size DECIMAL NOT NULL,

  -- Management decision
  action TEXT NOT NULL CHECK (action IN ('hold', 'adjust_sl', 'adjust_tp', 'reduce', 'close')),
  confidence DECIMAL NOT NULL,
  reasoning TEXT NOT NULL,

  -- Action details (JSONB for flexibility)
  action_details JSONB,  -- {newStopLoss, newTakeProfit, reduceAmount, etc.}

  -- Market context
  market_price DECIMAL NOT NULL,
  indicators JSONB,
  risk_assessment JSONB,  -- {marketRisk, positionRisk, etc.}

  -- Metadata
  raw_ai_response TEXT,
  analysis_latency_ms INTEGER,
  tokens_used INTEGER,
  model_name TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_position_mgmt_position ON position_management_decisions(position_id, timestamp DESC);
CREATE INDEX idx_position_mgmt_signal ON position_management_decisions(signal_id) WHERE signal_id IS NOT NULL;
CREATE INDEX idx_position_mgmt_trader ON position_management_decisions(trader_id);

-- Trigger to notify Go backend when position opens
CREATE OR REPLACE FUNCTION notify_start_position_management()
RETURNS TRIGGER AS $$
BEGIN
  -- Only notify for new positions
  IF TG_OP = 'INSERT' AND NEW.status = 'open' THEN
    PERFORM pg_notify(
      'start_position_management',
      json_build_object(
        'position_id', NEW.id,
        'signal_id', NEW.signal_id,
        'trader_id', NEW.trader_id,
        'symbol', NEW.symbol,
        'side', NEW.side,
        'entry_price', NEW.entry_price,
        'position_size', NEW.contracts,
        'interval', NEW.interval,  -- From trader config
        'timestamp', NEW.created_at
      )::text
    );

    RAISE LOG 'Position management started for position %', NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_start_position_management
AFTER INSERT ON positions
FOR EACH ROW
EXECUTE FUNCTION notify_start_position_management();
```

#### Step 2: New llm-proxy Operation

Create: `supabase/functions/llm-proxy/operations/managePosition.ts`

```typescript
export async function handleManagePosition(
  params: any,
  openRouterClient: any,
  promptLoader: any,
  config: any
): Promise<any> {
  return await traced(async (span) => {
    const {
      positionId, signalId, traderId, userId,
      currentPnl, currentPnlPct, positionSize,
      marketPrice, side, entryPrice,
      currentSL, currentTP, symbol, timestamp
    } = params;

    // Log inputs
    span.log({
      input: { positionId, symbol, currentPnl, currentPnlPct, action: 'manage' },
      metadata: { operation: 'manage-position', traderId, userId }
    });

    // Load prompt from Braintrust
    const prompt = await promptLoader.loadPromptWithVariables('manage-position', {
      symbol,
      side,
      entryPrice,
      currentPrice: marketPrice,
      currentPnl,
      currentPnlPct,
      positionSize,
      currentSL,
      currentTP,
      timestamp
    });

    // Call OpenRouter
    const result = await openRouterClient.generateStructuredResponse(prompt, {
      temperature: 0.7,
      max_tokens: 2000,
      modelName: 'google/gemini-2.5-flash'
    });

    // Build management decision
    const decision = {
      positionId,
      action: result.data.action,
      confidence: result.data.confidence,
      reasoning: result.data.reasoning,
      actionDetails: result.data.actionDetails || {},
      riskAssessment: result.data.riskAssessment || {},
      metadata: {
        tokensUsed: result.tokensUsed,
        modelName: config.modelId,
        rawAiResponse: result.rawResponse
      }
    };

    // Log outputs
    span.log({
      output: decision,
      metrics: { total_tokens: result.tokensUsed, confidence: decision.confidence }
    });

    return { data: decision, usage: { total_tokens: result.tokensUsed } };
  }, { name: "manage_position", type: "task" });
}
```

Add to `supabase/functions/llm-proxy/config/operations.ts`:
```typescript
'manage-position': {
  handler: 'managePosition',
  modelId: 'google/gemini-2.5-flash',
  temperature: 0.7,
  maxTokens: 2000,
  promptVersion: '1.0'
}
```

Create prompt: `supabase/functions/llm-proxy/prompts/manage-position.md`

#### Step 3: Go Backend - Position Management Engine

File: `backend/go-screener/internal/monitoring/position_manager.go` (new file)

```go
package monitoring

type PositionManager struct {
	config       *Config
	registry     *PositionRegistry  // Separate from signal monitoring
	eventBus     *eventbus.EventBus
	supabase     SupabaseClient
	exchangeSvc  ExchangeService
	ctx          context.Context
	cancel       context.CancelFunc
}

type PositionManagementState struct {
	PositionID    string
	SignalID      string
	TraderID      string
	Symbol        string
	Interval      string
	Side          string  // "long" or "short"
	EntryPrice    float64
	PositionSize  float64

	ManagementStarted time.Time
	LastManagementAt  time.Time
	ManagementCount   int

	IsActive  bool
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (pm *PositionManager) Start() error {
	// Listen for position opened notifications
	if err := pm.listenForPositionEvents(); err != nil {
		return err
	}

	// Subscribe to candle close events
	pm.eventBus.Subscribe(eventbus.EventTypeCandleClose, pm.handleCandleClose)

	return nil
}

func (pm *PositionManager) listenForPositionEvents() error {
	// Similar to setup monitoring, listen for PostgreSQL NOTIFY
	listener := pq.NewListener(...)
	err := listener.Listen("start_position_management")

	go func() {
		for {
			select {
			case notification := <-listener.Notify:
				var payload PositionOpenedPayload
				json.Unmarshal([]byte(notification.Extra), &payload)
				pm.startManagement(payload)
			case <-pm.ctx.Done():
				return
			}
		}
	}()

	return nil
}

func (pm *PositionManager) handleCandleClose(event interface{}) {
	closeEvent := event.(*eventbus.CandleCloseEvent)

	// Get all positions being managed for this symbol/interval
	positions := pm.registry.GetActiveBySymbolInterval(closeEvent.Symbol, closeEvent.Interval)

	for _, pos := range positions {
		go pm.managePosition(pos, closeEvent)
	}
}

func (pm *PositionManager) managePosition(state *PositionManagementState, candleEvent *eventbus.CandleCloseEvent) {
	// Fetch current position state from exchange
	position, err := pm.exchangeSvc.GetPosition(state.PositionID)
	if err != nil {
		log.Printf("[PositionManager] Failed to get position %s: %v", state.PositionID, err)
		return
	}

	// Check if position is still open
	if position.Status != "open" {
		log.Printf("[PositionManager] Position %s closed, stopping management", state.PositionID)
		pm.registry.Remove(state.PositionID)
		return
	}

	// Call llm-proxy for management decision
	decision, err := pm.callLLMProxy(state, position, candleEvent)
	if err != nil {
		log.Printf("[PositionManager] Failed to get management decision: %v", err)
		return
	}

	// Store decision in database
	if err := pm.storeDecision(state, position, decision); err != nil {
		log.Printf("[PositionManager] Failed to store decision: %v", err)
	}

	// Execute management action
	if err := pm.executeAction(state, position, decision); err != nil {
		log.Printf("[PositionManager] Failed to execute action: %v", err)
	}

	state.LastManagementAt = time.Now()
	state.ManagementCount++
}

func (pm *PositionManager) executeAction(state *PositionManagementState, position *Position, decision *ManagementDecision) error {
	switch decision.Action {
	case "hold":
		// Do nothing
		return nil

	case "adjust_sl":
		newSL := decision.ActionDetails["newStopLoss"].(float64)
		return pm.exchangeSvc.ModifyStopLoss(position.ID, newSL)

	case "adjust_tp":
		newTP := decision.ActionDetails["newTakeProfit"].(float64)
		return pm.exchangeSvc.ModifyTakeProfit(position.ID, newTP)

	case "reduce":
		reduceAmount := decision.ActionDetails["reduceAmount"].(float64)
		return pm.exchangeSvc.ReducePosition(position.ID, reduceAmount)

	case "close":
		return pm.exchangeSvc.ClosePosition(position.ID)

	default:
		return fmt.Errorf("unknown action: %s", decision.Action)
	}
}
```

### Files to Create/Modify

**New:**
- `supabase/migrations/030_position_management.sql`
- `supabase/functions/llm-proxy/operations/managePosition.ts`
- `supabase/functions/llm-proxy/prompts/manage-position.md`
- `backend/go-screener/internal/monitoring/position_manager.go`
- `backend/go-screener/internal/monitoring/position_registry.go`

**Modify:**
- `supabase/functions/llm-proxy/config/operations.ts`
- `supabase/functions/llm-proxy/index.ts` (register handler)

### Testing

**1. Unit Tests:**
```go
func TestStartPositionManagement(t *testing.T) {
	// Test NOTIFY creates PositionManagementState
}

func TestManagementActions(t *testing.T) {
	// Test each action type executes correctly
}

func TestPositionClosedStopsManagement(t *testing.T) {
	// Test workflow stops when position status='closed'
}
```

**2. Integration Test:**
```bash
# 1. Create test position (status='open')
# 2. Verify PostgreSQL NOTIFY sent
# 3. Verify Go backend created PositionManagementState
# 4. Trigger candle close
# 5. Verify llm-proxy called
# 6. Verify decision stored
# 7. Verify action executed (mock exchange)
```

**3. End-to-End Test:**
```bash
# Full flow with real position
# 1. Open position (from signal or manual)
# 2. Wait for candle close
# 3. Check position_management_decisions table
# 4. Verify SL/TP updated (if action=adjust_sl/adjust_tp)
# 5. Close position
# 6. Verify management stopped
```

### Success Criteria

- [ ] position_management_decisions table created
- [ ] PostgreSQL NOTIFY trigger on positions INSERT
- [ ] Go backend receives position opened notifications
- [ ] PositionManagementState created in registry
- [ ] Candle close triggers position management
- [ ] llm-proxy manage-position operation working
- [ ] Decisions stored in database
- [ ] Management actions executed (adjust SL/TP, reduce, close)
- [ ] Management stops when position closed
- [ ] End-to-end test passes

### Dependencies

**Requires working:**
- Trade execution system (positions table)
- CCXT exchange integration (modify orders, close positions)
- llm-proxy deployment
- Go backend infrastructure

**Can work independently from:**
- Setup monitoring workflow (separate concern)

### Effort Estimate

**5-7 days**
- Day 1: Database schema, NOTIFY trigger
- Day 2: llm-proxy manage-position operation + prompt
- Day 3: Go PositionManager, PostgreSQL LISTEN
- Day 4: Candle close subscription, action execution
- Day 5: Unit tests
- Day 6: Integration tests
- Day 7: End-to-end testing with mock positions
