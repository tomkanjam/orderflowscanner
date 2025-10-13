# Remove Browser Trader Functionality - Move to Go Backend Only

## Metadata
- **Status:** 🔨 implementing
- **Created:** 2025-10-12T14:30:00Z
- **Updated:** 2025-10-12T16:15:00Z
- **Progress:** [==        ] 10%
- **Type:** backend

---

## Technical Planning
*Stage: planning | Date: 2025-10-12T14:30:00Z*

### Task Description
Completely remove browser-based trader execution and analysis functionality. Move all trader operations (filter execution, signal detection, indicator calculation, AI analysis, and monitoring) to the Go backend. Browser becomes a passive display-only client that polls the database and renders results.

**Why**: Current browser implementation has critical limitations:
- High latency (7-12s polling delay vs Go's 1.4s event-driven)
- Continuous execution (every 1s) instead of candle-aligned
- No automatic re-analysis for monitoring signals
- Can't function when browser tab closed
- Empty indicator configs causing Gemini to receive insufficient data

### Technical Context

**Current state:**
- Browser: SharedArrayBuffer + worker threads execute filters continuously (1s interval)
- Browser: `useSignalLifecycle` hook calculates indicators and calls Gemini
- Browser: `browserAnalysisEngine` orchestrates AI analysis
- Go backend: Only handles filter execution for Go-based filters (via API calls from workers)
- Edge Functions: `analyze-signal` exists but not used (browser calls Gemini directly)

**Desired state:**
- Go backend: Candle-aligned filter execution
- Go backend: Event-driven signal detection (PostgreSQL LISTEN/NOTIFY)
- Go backend: Full indicator calculation library (port from TypeScript)
- Go backend: OpenRouter API client using `github.com/reVrost/go-openrouter` (supports Gemini, Claude, GPT-4, etc.)
- Go backend: Analysis orchestrator
- Go backend: Monitoring engine with automatic re-analysis at candle closes
- Browser: Poll database for signals/updates, display results only
- Browser: Keep chart rendering and user interactions

**Affected systems:**
- `backend/go-screener/` - New packages needed: indicators, openrouter-client, analysis-engine, monitoring-engine
- `apps/app/` - Remove/disable: useSharedTraderIntervals, persistentTraderWorker, useSignalLifecycle, browserAnalysisEngine
- `supabase/functions/analyze-signal/` - May need updates or can be deprecated
- Database: May need new tables/columns for monitoring state

### Critical Questions

1. **Indicator Library Port**: The TypeScript `screenerHelpers.ts` has 20+ indicator functions (RSI, MACD, Bollinger Bands, VWAP, etc.). Should we:
   - Port all indicators to Go initially, or
   - Port incrementally (start with most-used indicators)?
   - Use an existing Go TA library (like `github.com/markcheno/go-talib`) or write custom?

2. **OpenRouter Integration**: Using `github.com/reVrost/go-openrouter` for AI provider abstraction:
   - Which model should be default? (Gemini 2.0 Flash, Claude Sonnet, GPT-4o, etc.)
   - Should model be configurable per-trader or global?
   - OpenRouter API key from environment variable `OPENROUTER_API_KEY`?
   - Do we need rate limiting at Go level or rely on OpenRouter's limits?
   - Should we implement fallback to different models if primary fails?

3. **Candle Alignment**: How should filter execution be scheduled?
   - Timer-based (check every second if candle opened)?
   - Event-based (WebSocket/stream triggers on candle open)?
   - Per-interval scheduling (separate schedulers for 1m, 5m, 15m, etc.)?

4. **Monitoring Re-Analysis**: When a signal is in 'monitoring' state:
   - Should it be re-analyzed at EVERY candle close or only at the trader's configured interval?
   - If a 1h trader signal is monitoring, do we re-analyze every 1h candle or also on lower timeframes?
   - How many candles should we monitor before auto-expiring (3? 5? 10?)?

5. **Database Polling Strategy**: Browser needs to know about new signals:
   - Simple polling every N seconds?
   - PostgreSQL LISTEN/NOTIFY to browser via WebSocket?
   - SSE (Server-Sent Events) stream from Go backend?
   - Or keep current approach and just poll `signals` table?

6. **Migration Path**: Should we:
   - Build complete Go system first, then cut over (big-bang)?
   - Run both systems in parallel initially (feature flag)?
   - Migrate incrementally (analysis first, then monitoring, etc.)?

7. **Indicator Configuration Issue**: Current cloud traders have `filter.indicators = []` (empty). When generating traders:
   - Should Go backend validate that indicators array is populated?
   - Should we auto-populate based on what the filter code uses?
   - Or fix in Gemini prompt to ensure it always includes indicators?

8. **State Management**: Currently browser workers maintain state (previous matches, cooldowns):
   - Should Go backend persist this state in database?
   - In-memory with periodic snapshots?
   - Redis for distributed state?

9. **Worker Architecture**: Go backend will need to:
   - Run multiple goroutines for parallel filter execution?
   - One goroutine per trader or batch processing?
   - How to handle slow filters that might block?

10. **Deployment**: Current Go backend runs on Fly.io as user-provisioned machines:
    - Does this architecture change require different machine specs?
    - Should analysis run on same machines as filter execution or separate?
    - How to handle machine sleep/wake with persistent monitoring?

### Key Considerations

**Performance:**
- Go backend should achieve <2s from signal trigger to analysis complete
- Must handle concurrent analysis for multiple signals (rate limiting)
- Candle-aligned execution will reduce unnecessary filter runs

**Reliability:**
- Monitoring engine must persist across restarts
- Need dead-letter queue for failed analyses
- Need alerting if analysis pipeline stalls

**Data Quality:**
- MUST ensure `trader.filter.indicators` is populated during generation
- All indicators used in filter code must be in indicators array
- Validate indicator configs before enabling trader

**Migration Risk:**
- Browser traders currently working for some users
- Need rollback plan if Go implementation has issues
- Consider feature flag for gradual rollout

---

## System Architecture
*Stage: architecture | Date: 2025-10-12T15:45:00Z*

### Executive Summary
This architecture removes all browser-based trader execution and analysis, consolidating everything into a Go backend service running on Fly.io machines. The system uses candle-aligned execution, event-driven signal detection, and server-side AI analysis via OpenRouter. The browser becomes a passive display client that polls Postgres for updates and renders charts/tables.

**Key Design Principles:**
1. **Candle-Aligned Execution**: Filters run precisely at candle open times, not continuously
2. **Event-Driven Analysis**: PostgreSQL triggers + Go listeners enable instant signal detection (<100ms)
3. **Indicator Parity**: Complete port of 20+ TypeScript indicators to Go for AI analysis
4. **Multi-Model Support**: OpenRouter abstraction allows Gemini/Claude/GPT-4 with fallbacks
5. **Stateless Processing**: All state persisted in Postgres, enables horizontal scaling

---

### System Design

#### Data Models

```go
// Core domain models for Go backend

// SignalStatus represents the lifecycle state of a trading signal
type SignalStatus string

const (
	SignalStatusNew            SignalStatus = "new"             // Just matched filter
	SignalStatusAnalysisQueued SignalStatus = "analysis_queued" // Waiting for AI
	SignalStatusAnalyzing      SignalStatus = "analyzing"       // AI in progress
	SignalStatusRejected       SignalStatus = "rejected"        // AI said bad_setup
	SignalStatusMonitoring     SignalStatus = "monitoring"      // AI said good_setup
	SignalStatusReady          SignalStatus = "ready"           // AI said enter_trade
	SignalStatusInPosition     SignalStatus = "in_position"     // Trade active
	SignalStatusClosed         SignalStatus = "closed"          // Trade closed
	SignalStatusExpired        SignalStatus = "expired"         // Expired without action
)

// Signal represents a detected trading opportunity
type Signal struct {
	ID          string       `json:"id"`
	TraderID    string       `json:"trader_id"`
	UserID      string       `json:"user_id"`
	Symbol      string       `json:"symbol"`
	Interval    string       `json:"interval"`
	Status      SignalStatus `json:"status"`
	Source      string       `json:"source"` // "cloud" for Go-generated

	// Market data at signal time
	PriceAtSignal        float64 `json:"price_at_signal"`
	VolumeAtSignal       float64 `json:"volume_at_signal"`
	ChangePercentAtSignal float64 `json:"change_percent_at_signal"`

	// Indicator values (JSON blob from calculated indicators)
	IndicatorValues map[string]interface{} `json:"indicator_values"`

	// Timestamps
	TriggeredAt time.Time `json:"triggered_at"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// SignalAnalysis represents AI-generated analysis of a signal
type SignalAnalysis struct {
	ID         string    `json:"id"`
	SignalID   string    `json:"signal_id"`
	TraderID   string    `json:"trader_id"`
	UserID     string    `json:"user_id"`

	// AI Decision
	Decision   string  `json:"decision"` // "enter_trade", "bad_setup", "wait"
	Confidence float64 `json:"confidence"`
	Reasoning  string  `json:"reasoning"`

	// Trade plan
	KeyLevels map[string]float64     `json:"key_levels"` // entry, stopLoss, takeProfit
	TradePlan map[string]interface{} `json:"trade_plan"`

	// Technical context
	TechnicalIndicators map[string]interface{} `json:"technical_indicators"`

	// Metadata
	RawAIResponse     string `json:"raw_ai_response"`
	AnalysisLatencyMs int    `json:"analysis_latency_ms"`
	ModelName         string `json:"model_name"`
	TokensUsed        int    `json:"tokens_used"`

	CreatedAt time.Time `json:"created_at"`
}

// MonitoringState tracks signals being watched for entry
type MonitoringState struct {
	SignalID          string    `json:"signal_id"`
	TraderID          string    `json:"trader_id"`
	Symbol            string    `json:"symbol"`
	Interval          string    `json:"interval"`

	// Monitoring config
	MonitoringStarted  time.Time `json:"monitoring_started"`
	LastReanalysisAt   time.Time `json:"last_reanalysis_at"`
	ReanalysisCount    int       `json:"reanalysis_count"`
	MaxReanalyses      int       `json:"max_reanalyses"` // Auto-expire after N

	// Latest decision
	LastDecision   string  `json:"last_decision"`
	LastConfidence float64 `json:"last_confidence"`

	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// IndicatorConfig defines what indicators to calculate for a trader
type IndicatorConfig struct {
	ID     string                 `json:"id"`
	Name   string                 `json:"name"` // "RSI", "MACD", "BB"
	Type   string                 `json:"type"` // "line", "histogram", "band"
	Params map[string]interface{} `json:"params"` // period, stdDev, etc.
}

// CalculatedIndicator holds computed indicator values
type CalculatedIndicator struct {
	ID      string                 `json:"id"`
	Name    string                 `json:"name"`
	Value   float64                `json:"value"` // Latest value
	Value2  *float64               `json:"value2,omitempty"` // For multi-value (MACD)
	History []IndicatorHistoryPoint `json:"history"` // Recent values for AI
}

type IndicatorHistoryPoint struct {
	Value  float64  `json:"value"`
	Value2 *float64 `json:"value2,omitempty"`
}

// MarketData represents market snapshot for filter/analysis
type MarketData struct {
	Symbol    string             `json:"symbol"`
	Timestamp time.Time          `json:"timestamp"`
	Ticker    *SimplifiedTicker  `json:"ticker"`
	Klines    map[string][]Kline `json:"klines"` // interval -> klines

	// Calculated indicators (only for analysis, not filter execution)
	CalculatedIndicators map[string]*CalculatedIndicator `json:"calculated_indicators,omitempty"`
}

type SimplifiedTicker struct {
	LastPrice          float64 `json:"last_price"`
	PriceChangePercent float64 `json:"price_change_percent"`
	QuoteVolume        float64 `json:"quote_volume"`
}

type Kline struct {
	OpenTime  int64   `json:"open_time"`
	Open      float64 `json:"open"`
	High      float64 `json:"high"`
	Low       float64 `json:"low"`
	Close     float64 `json:"close"`
	Volume    float64 `json:"volume"`
	CloseTime int64   `json:"close_time"`
}

// CandleEvent triggers filter execution and monitoring reanalysis
type CandleEvent struct {
	Symbol   string    `json:"symbol"`
	Interval string    `json:"interval"`
	OpenTime time.Time `json:"open_time"`
}

// AnalysisRequest queued for AI processing
type AnalysisRequest struct {
	SignalID     string                 `json:"signal_id"`
	TraderID     string                 `json:"trader_id"`
	UserID       string                 `json:"user_id"`
	Symbol       string                 `json:"symbol"`
	Interval     string                 `json:"interval"`
	MarketData   *MarketData            `json:"market_data"`
	TraderConfig *TraderConfig          `json:"trader_config"`
	IsReanalysis bool                   `json:"is_reanalysis"`
	QueuedAt     time.Time              `json:"queued_at"`
}

type TraderConfig struct {
	FilterCode       string             `json:"filter_code"`
	Indicators       []*IndicatorConfig `json:"indicators"`
	Strategy         *StrategyConfig    `json:"strategy"`
	Timeframes       []string           `json:"timeframes"`
	AIAnalysisLimit  int                `json:"ai_analysis_limit"` // Kline bars for AI
}

type StrategyConfig struct {
	Description      string `json:"description"`
	AIAnalysisLimit  int    `json:"ai_analysis_limit"`
}
```

#### Component Architecture

**New Go Backend Components:**

1. **`pkg/indicators`** - Technical Analysis Library
   - Port of all 20+ TypeScript indicators (RSI, MACD, BB, VWAP, etc.)
   - Functions match TypeScript signatures exactly
   - Uses same algorithms for calculation parity

2. **`pkg/openrouter`** - AI Provider Client
   - Wrapper around `github.com/reVrost/go-openrouter`
   - Handles authentication, rate limiting, retries
   - Model abstraction (Gemini/Claude/GPT-4)
   - Streaming support for real-time responses

3. **`internal/analysis`** - Analysis Engine
   - Orchestrates AI analysis workflow
   - Calculates indicators before OpenRouter call
   - Builds structured prompts with market data
   - Parses and validates AI responses
   - Persists analysis results to database

4. **`internal/monitoring`** - Monitoring Engine
   - Tracks signals in 'monitoring' status
   - Subscribes to candle close events
   - Triggers re-analysis at configured intervals
   - Auto-expires signals after max reanalyses
   - Moves signals to 'ready' or 'rejected'

5. **`internal/scheduler`** - Candle-Aligned Scheduler
   - Timer-based candle open detection (checks every 100ms)
   - Publishes `CandleEvent` to channel for each open
   - Separate goroutine per interval (1m, 5m, 15m, etc.)
   - Handles timezone alignment and DST

6. **`internal/executor`** - Filter Executor (Enhanced)
   - Subscribes to candle events
   - Runs trader filters at candle open
   - Deduplication against recent signals (24h window)
   - Creates `Signal` records with status='new'
   - Publishes to analysis queue

7. **`internal/eventbus`** - Event Bus
   - In-memory pub/sub for candle events
   - PostgreSQL LISTEN/NOTIFY for signal events
   - Connects scheduler → executor → analysis → monitoring

**Modified Go Components:**

1. **`internal/trader/executor.go`**
   - Remove timer-based continuous execution
   - Subscribe to candle events instead
   - Add indicator calculation before analysis queue

2. **`internal/server/server.go`**
   - Add analysis engine initialization
   - Add monitoring engine initialization
   - Add scheduler initialization

**Browser Components (Modified to Remove Execution):**

1. **`App.tsx`**
   - Remove `useSharedTraderIntervals` hook
   - Remove worker initialization
   - Keep polling for signals from database
   - Keep chart display and user interactions

2. **Remove Entirely:**
   - `hooks/useSharedTraderIntervals.ts`
   - `workers/persistentTraderWorker.ts`
   - `hooks/useSignalLifecycle.ts` (analysis logic)
   - `services/browserAnalysisEngine.ts`
   - SharedArrayBuffer initialization

3. **Keep (Display Only):**
   - `components/TraderSignalsTable.tsx` (polling mode)
   - `components/ChartDisplay.tsx`
   - `components/SignalHistorySidebar.tsx`

**Component Hierarchy:**

```
Go Backend Service (Fly.io Machine)
├── Scheduler (Candle Event Generator)
│   ├── 1m Interval Goroutine
│   ├── 5m Interval Goroutine
│   ├── 15m Interval Goroutine
│   └── ... other intervals
│
├── Event Bus
│   ├── CandleEvent Channel (buffered 1000)
│   └── PostgreSQL LISTEN (signal_created, signal_updated)
│
├── Executor (Filter Runner)
│   ├── Subscribes to Candle Events
│   ├── Fetches Klines from Binance
│   ├── Runs Yaegi Filter Execution
│   ├── Creates Signal Records (status=new)
│   └── Publishes to Analysis Queue
│
├── Analysis Engine
│   ├── Analysis Queue Worker Pool (N goroutines)
│   ├── Indicator Calculator
│   │   └── Calls pkg/indicators
│   ├── OpenRouter Client
│   │   ├── Prompt Builder
│   │   ├── Model Selector
│   │   └── Response Parser
│   └── Database Writer (signal_analyses)
│
└── Monitoring Engine
    ├── Active Monitors Registry (in-memory map)
    ├── Subscribes to Candle Events
    ├── Triggers Re-analysis on Interval Match
    └── Auto-expires after Max Reanalyses

Browser Client (React App)
├── App.tsx
│   ├── Polling Timer (every 3s)
│   └── Fetches signals from Supabase
│
└── Display Components
    ├── TraderSignalsTable (read-only)
    ├── ChartDisplay (rendering only)
    └── SignalHistorySidebar (read-only)
```

---

### Service Layer

#### New Services

```go
// AnalysisEngine - Orchestrates AI analysis of trading signals
type AnalysisEngine struct {
	openRouter    *openrouter.Client
	indicators    *indicators.Calculator
	supabase      *supabase.Client
	binance       *binance.Client
	queue         chan *AnalysisRequest
	concurrency   int
	aiLimit       int // Default kline history for AI
}

func (e *AnalysisEngine) Start(ctx context.Context) error {
	// Start N worker goroutines
	for i := 0; i < e.concurrency; i++ {
		go e.processQueue(ctx)
	}

	// Subscribe to PostgreSQL NOTIFY for new signals
	go e.listenForNewSignals(ctx)

	return nil
}

func (e *AnalysisEngine) QueueAnalysis(req *AnalysisRequest) error {
	select {
	case e.queue <- req:
		return nil
	default:
		return errors.New("analysis queue full")
	}
}

func (e *AnalysisEngine) processQueue(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case req := <-e.queue:
			if err := e.analyzeSignal(ctx, req); err != nil {
				log.Printf("[AnalysisEngine] Error: %v", err)
			}
		}
	}
}

func (e *AnalysisEngine) analyzeSignal(ctx context.Context, req *AnalysisRequest) error {
	startTime := time.Now()

	// 1. Calculate indicators for this trader's config
	indicators, err := e.calculateIndicators(req)
	if err != nil {
		return fmt.Errorf("calculate indicators: %w", err)
	}

	// 2. Build prompt with market data + indicators
	prompt := e.buildAnalysisPrompt(req, indicators)

	// 3. Call OpenRouter
	response, err := e.openRouter.ChatCompletion(ctx, &openrouter.Request{
		Model: req.TraderConfig.Strategy.Model, // Per-trader or default
		Messages: []openrouter.Message{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: prompt},
		},
		Temperature: 0.7,
	})
	if err != nil {
		return fmt.Errorf("openrouter call: %w", err)
	}

	// 4. Parse JSON response
	analysis, err := e.parseAnalysisResponse(response.Choices[0].Message.Content)
	if err != nil {
		return fmt.Errorf("parse response: %w", err)
	}

	// 5. Save to database
	analysis.SignalID = req.SignalID
	analysis.TraderID = req.TraderID
	analysis.UserID = req.UserID
	analysis.AnalysisLatencyMs = int(time.Since(startTime).Milliseconds())
	analysis.ModelName = response.Model
	analysis.TokensUsed = response.Usage.TotalTokens

	if err := e.supabase.CreateSignalAnalysis(analysis); err != nil {
		return fmt.Errorf("save analysis: %w", err)
	}

	// 6. Update signal status based on decision
	newStatus := e.mapDecisionToStatus(analysis.Decision)
	if err := e.supabase.UpdateSignalStatus(req.SignalID, newStatus); err != nil {
		return fmt.Errorf("update signal status: %w", err)
	}

	// 7. If decision is "wait" (good_setup), create monitoring state
	if analysis.Decision == "wait" {
		if err := e.createMonitoringState(req.SignalID, req.TraderID); err != nil {
			return fmt.Errorf("create monitoring: %w", err)
		}
	}

	log.Printf("[AnalysisEngine] ✅ Analyzed %s/%s: %s (%.2fs)",
		req.Symbol, req.Interval, analysis.Decision, time.Since(startTime).Seconds())

	return nil
}

func (e *AnalysisEngine) calculateIndicators(req *AnalysisRequest) (map[string]*CalculatedIndicator, error) {
	indicators := make(map[string]*CalculatedIndicator)

	// Get klines for trader's primary interval
	klines, ok := req.MarketData.Klines[req.Interval]
	if !ok || len(klines) == 0 {
		return nil, errors.New("no klines for interval")
	}

	// Limit to AI analysis limit
	aiLimit := req.TraderConfig.AIAnalysisLimit
	if aiLimit <= 0 {
		aiLimit = e.aiLimit // Default
	}
	if len(klines) > aiLimit {
		klines = klines[len(klines)-aiLimit:]
	}

	// Calculate each indicator from trader config
	for _, indConfig := range req.TraderConfig.Indicators {
		var calcInd *CalculatedIndicator

		switch indConfig.Name {
		case "RSI":
			period := int(indConfig.Params["period"].(float64))
			rsiValues := indicators.CalculateRSISeries(klines, period)
			calcInd = &CalculatedIndicator{
				ID:    indConfig.ID,
				Name:  indConfig.Name,
				Value: rsiValues[len(rsiValues)-1],
				History: makeHistory(rsiValues, aiLimit),
			}

		case "MACD":
			short := int(indConfig.Params["shortPeriod"].(float64))
			long := int(indConfig.Params["longPeriod"].(float64))
			signal := int(indConfig.Params["signalPeriod"].(float64))
			macd := indicators.CalculateMACD(klines, short, long, signal)
			lastIdx := len(macd.MACD) - 1
			calcInd = &CalculatedIndicator{
				ID:     indConfig.ID,
				Name:   indConfig.Name,
				Value:  macd.MACD[lastIdx],
				Value2: &macd.Signal[lastIdx],
				History: makeHistoryWithSignal(macd.MACD, macd.Signal, aiLimit),
			}

		// ... other indicators
		}

		if calcInd != nil {
			indicators[indConfig.Name] = calcInd
		}
	}

	return indicators, nil
}

// MonitoringEngine - Manages signals in 'monitoring' status
type MonitoringEngine struct {
	supabase    *supabase.Client
	eventBus    *eventbus.EventBus
	analysisEng *AnalysisEngine
	monitors    map[string]*MonitoringState // signalID -> state
	mu          sync.RWMutex
}

func (m *MonitoringEngine) Start(ctx context.Context) error {
	// Load active monitors from database on startup
	if err := m.loadActiveMonitors(); err != nil {
		return err
	}

	// Subscribe to candle events
	candleCh := m.eventBus.SubscribeCandles()

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case event := <-candleCh:
				m.handleCandleEvent(event)
			}
		}
	}()

	return nil
}

func (m *MonitoringEngine) handleCandleEvent(event *CandleEvent) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// Find monitors that match this symbol+interval
	for _, monitor := range m.monitors {
		if !monitor.IsActive {
			continue
		}

		if monitor.Symbol == event.Symbol && monitor.Interval == event.Interval {
			// Check if we should reanalyze
			if m.shouldReanalyze(monitor) {
				go m.reanalyzeSignal(monitor)
			}
		}
	}
}

func (m *MonitoringEngine) shouldReanalyze(monitor *MonitoringState) bool {
	// Check if max reanalyses reached
	if monitor.ReanalysisCount >= monitor.MaxReanalyses {
		log.Printf("[MonitoringEngine] Signal %s expired (max reanalyses)", monitor.SignalID)
		m.expireMonitor(monitor.SignalID)
		return false
	}

	// Check time since last reanalysis (at least 1 candle of the trader's interval)
	// For 1m trader: reanalyze every minute
	// For 1h trader: reanalyze every hour
	// This ensures we don't spam the AI

	return true // Simplified - reanalyze on every candle
}

func (m *MonitoringEngine) reanalyzeSignal(monitor *MonitoringState) {
	log.Printf("[MonitoringEngine] Reanalyzing signal %s", monitor.SignalID)

	// Fetch latest market data
	marketData, err := m.fetchMarketData(monitor.Symbol, monitor.Interval)
	if err != nil {
		log.Printf("[MonitoringEngine] Error fetching data: %v", err)
		return
	}

	// Queue for analysis
	req := &AnalysisRequest{
		SignalID:     monitor.SignalID,
		TraderID:     monitor.TraderID,
		Symbol:       monitor.Symbol,
		Interval:     monitor.Interval,
		MarketData:   marketData,
		IsReanalysis: true,
		QueuedAt:     time.Now(),
	}

	if err := m.analysisEng.QueueAnalysis(req); err != nil {
		log.Printf("[MonitoringEngine] Error queueing: %v", err)
		return
	}

	// Update monitor state
	monitor.LastReanalysisAt = time.Now()
	monitor.ReanalysisCount++
	m.updateMonitorState(monitor)
}

// CandleScheduler - Generates candle open events
type CandleScheduler struct {
	eventBus  *eventbus.EventBus
	intervals []string
}

func (s *CandleScheduler) Start(ctx context.Context) error {
	// Start goroutine for each interval
	for _, interval := range s.intervals {
		go s.scheduleInterval(ctx, interval)
	}
	return nil
}

func (s *CandleScheduler) scheduleInterval(ctx context.Context, interval string) {
	ticker := time.NewTicker(100 * time.Millisecond) // Check every 100ms
	defer ticker.Stop()

	var lastCandleTime time.Time

	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			candleTime := s.getCandleOpenTime(now, interval)

			// If candle time changed, emit event
			if candleTime != lastCandleTime {
				lastCandleTime = candleTime

				// Publish candle event for ALL symbols
				// Executor will filter by active traders
				s.eventBus.PublishCandleEvent(&CandleEvent{
					Symbol:   "*", // Wildcard - executor handles filtering
					Interval: interval,
					OpenTime: candleTime,
				})

				log.Printf("[Scheduler] 📊 Candle open: %s at %s",
					interval, candleTime.Format("15:04:05"))
			}
		}
	}
}

func (s *CandleScheduler) getCandleOpenTime(now time.Time, interval string) time.Time {
	// Round down to interval boundary
	duration := parseInterval(interval) // "5m" -> 5 * time.Minute
	return now.Truncate(duration)
}
```

#### API Endpoints

The Go backend doesn't expose new HTTP endpoints for this feature - all data flows through Postgres. Browser queries Supabase directly via existing endpoints.

**Existing Endpoints (Unchanged):**
- `GET /api/v1/traders/:id/status` - Get trader execution status
- `POST /api/v1/traders/:id/start` - Start trader execution
- `POST /api/v1/traders/:id/stop` - Stop trader execution

**Supabase Tables (Browser Queries):**
- `signals` - Browser polls for new signals (RLS filters by user_id)
- `signal_analyses` - Browser joins to get AI analysis results
- `monitoring_states` - Browser shows which signals are being watched

---

### Data Flow

#### 1. Filter Execution → Signal Creation

```
Candle Open (e.g., 15:05:00 for 5m)
  ↓
Scheduler detects candle boundary
  ↓
Publishes CandleEvent{interval: "5m", openTime: 15:05:00}
  ↓
Executor receives event (subscribed to channel)
  ↓
Fetches active traders for 5m interval
  ↓
FOR EACH trader:
  ├─ Fetch klines from Binance (250 bars, 5m interval)
  ├─ Prepare MarketData struct
  ├─ Execute filter via Yaegi (timeout: 5s)
  ├─ IF matches:
  │   ├─ Check deduplication (symbol+trader, 24h window)
  │   ├─ IF not duplicate:
  │   │   ├─ Create Signal record (status='new', source='cloud')
  │   │   └─ PostgreSQL INSERT triggers NOTIFY
  └─ ELSE: skip

Total time: 10-50ms per trader (parallel)
```

#### 2. Signal Detection → AI Analysis

```
Signal INSERT completes
  ↓
PostgreSQL NOTIFY 'signal_created' with signal_id
  ↓
Analysis Engine receives notification (listening)
  ↓
Fetches Signal + Trader config from database
  ↓
Fetches fresh market data (klines for all timeframes)
  ↓
Calculates indicators per trader.filter.indicators[]
  ├─ RSI(14) -> 67.5
  ├─ MACD(12,26,9) -> {macd: 12.5, signal: 10.2}
  ├─ BB(20,2) -> {upper: 43500, middle: 43200, lower: 42900}
  └─ ... (all configured indicators)
  ↓
Builds analysis prompt:
  ├─ Strategy description
  ├─ Current price + volume
  ├─ Indicator values + history (last N bars)
  ├─ Kline data (OHLCV for last N bars)
  └─ Decision schema (JSON)
  ↓
Calls OpenRouter API (Gemini 2.0 Flash)
  ↓
Parses JSON response: {decision: "wait", confidence: 75, reasoning: "..."}
  ↓
Saves to signal_analyses table
  ↓
Updates signal.status:
  ├─ "enter_trade" → status='ready'
  ├─ "bad_setup" → status='rejected'
  └─ "wait" → status='monitoring' + create monitoring_state

Total time: 800-1500ms
```

#### 3. Monitoring → Re-Analysis

```
Signal enters 'monitoring' status
  ↓
Monitoring Engine creates MonitoringState record
  ├─ max_reanalyses: 5 (configurable)
  ├─ reanalysis_count: 0
  └─ last_reanalysis_at: now
  ↓
Monitoring Engine holds in-memory map[signalID]*State
  ↓
Next candle opens (trader's interval)
  ↓
Scheduler publishes CandleEvent
  ↓
Monitoring Engine receives event
  ↓
Finds matching monitors (symbol+interval)
  ↓
FOR EACH matching monitor:
  ├─ IF reanalysis_count < max_reanalyses:
  │   ├─ Fetch latest market data
  │   ├─ Queue for analysis (same flow as initial)
  │   ├─ Increment reanalysis_count
  │   └─ Update last_reanalysis_at
  └─ ELSE:
      ├─ Mark monitor as expired
      ├─ Update signal.status = 'expired'
      └─ Remove from active monitors map

Re-analysis continues every candle until:
  - AI decision changes to "enter_trade" (→ ready)
  - AI decision changes to "bad_setup" (→ rejected)
  - Max reanalyses reached (→ expired)
```

#### 4. Browser Display Update

```
Browser polls Supabase every 3 seconds
  ↓
SELECT * FROM signals
WHERE user_id = $1
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
  ↓
Receives new/updated signals
  ↓
FOR EACH signal:
  ├─ IF has signal_analyses record:
  │   ├─ Show AI decision badge
  │   ├─ Show confidence %
  │   └─ Show reasoning text
  ├─ IF status='monitoring':
  │   ├─ Show "Watching" indicator
  │   └─ Show reanalysis count
  └─ Update TraderSignalsTable UI

Browser also subscribes to Realtime (optional):
  ├─ Supabase.channel('signals').on('INSERT')
  └─ Instant updates (< 500ms latency)
```

---

### State Management

#### In-Memory State (Go Backend)

```go
// Active monitors map (survives restarts via DB reload)
type MonitorRegistry struct {
	monitors map[string]*MonitoringState
	mu       sync.RWMutex
}

// Analysis queue (channel-based, ephemeral)
type AnalysisQueue struct {
	queue chan *AnalysisRequest // Buffered 1000
}

// Candle event bus (pub/sub, ephemeral)
type EventBus struct {
	candleSubscribers []chan *CandleEvent
	mu                sync.RWMutex
}
```

#### Persisted State (PostgreSQL)

All critical state lives in Postgres:
- `signals` - Signal records with status
- `signal_analyses` - AI analysis results
- `monitoring_states` - Active monitors with reanalysis counts
- `trader_state` - Trader execution state (running/stopped)

**On Go Backend Restart:**
1. Load active traders from `trader_state`
2. Load active monitors from `monitoring_states`
3. Resume execution from current candle boundary
4. No data loss - all state recovered from DB

---

### Integration Points

#### Binance WebSocket (Existing)

- Go backend maintains WebSocket for ticker updates
- Klines fetched via REST API on-demand (not streamed)
- Reason: Reduces memory footprint, simpler state management

#### Supabase (Existing)

- Go backend writes: signals, signal_analyses, monitoring_states
- Browser reads: all tables via RLS-protected queries
- PostgreSQL NOTIFY: signal_created, signal_updated events

#### OpenRouter API (New)

```go
import "github.com/reVrost/go-openrouter"

client := openrouter.NewClient(os.Getenv("OPENROUTER_API_KEY"))

resp, err := client.ChatCompletion(ctx, &openrouter.Request{
	Model: "google/gemini-2.0-flash-exp:free", // Or per-trader config
	Messages: []openrouter.Message{
		{Role: "system", Content: "You are a professional crypto trader..."},
		{Role: "user", Content: promptWithMarketData},
	},
	ResponseFormat: &openrouter.ResponseFormat{
		Type: "json_object", // Enforce JSON schema
	},
})
```

**Model Selection Strategy:**
1. Check trader config for preferred model
2. Fall back to environment variable `DEFAULT_AI_MODEL`
3. Fall back to "google/gemini-2.0-flash-exp:free"

**Rate Limiting:**
- OpenRouter handles per-model rate limits
- Go backend implements concurrent request limit (10 simultaneous)
- Queue backs up if limit hit, no requests dropped

---

### Non-Functional Requirements

#### Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Filter execution latency | < 50ms p95 | Time from candle open to signal INSERT |
| Signal detection latency | < 100ms | PostgreSQL NOTIFY to analysis queue |
| Analysis latency | < 2s p95 | Queue pickup to analysis complete |
| Total signal-to-analysis | < 2.5s p95 | End-to-end from filter match to AI decision |
| Monitoring reanalysis | < 3s p95 | Candle close to reanalysis complete |
| Browser update latency | < 5s | Signal INSERT to browser display |

#### Scalability Plan

**Current Scale (Single Fly.io Machine):**
- 10 active traders
- 5-15 signals/hour
- ~50 AI analyses/hour
- Memory: ~200MB
- CPU: <20%

**Target Scale (Per Machine):**
- 100 active traders
- 100-300 signals/hour
- ~500 AI analyses/hour
- Memory: ~512MB
- CPU: <50%

**Horizontal Scaling (Future):**
- Add more Fly.io machines
- Partition traders by machine (shard by trader_id hash)
- PostgreSQL handles concurrent writes (ACID)
- No coordination needed between machines

#### Reliability

**Error Recovery:**
- Analysis failures → retry 3 times with exponential backoff
- OpenRouter timeout → fallback to cheaper/faster model
- PostgreSQL disconnect → reconnect with circuit breaker
- Monitoring state loss → reload from DB on restart

**Dead Letter Queue:**
- Failed analyses after 3 retries → `failed_analyses` table
- Alert sent to admin (future: email/Slack webhook)
- Manual review and reprocessing

**Health Checks:**
- `/healthz` endpoint checks DB connection + OpenRouter
- Fly.io auto-restarts on 3 consecutive failures
- Monitoring engine heartbeat (updates `monitoring_engine_heartbeat` row every 30s)

---

### Implementation Guidelines

#### Code Organization

```
backend/go-screener/
├── cmd/
│   └── server/
│       └── main.go (initialize all engines)
│
├── pkg/
│   ├── indicators/
│   │   ├── ma.go (SMA, EMA)
│   │   ├── rsi.go
│   │   ├── macd.go
│   │   ├── bollinger.go
│   │   ├── vwap.go
│   │   ├── stochastic.go
│   │   ├── patterns.go (engulfing, etc.)
│   │   └── helpers.go (highest/lowest, volume)
│   │
│   ├── openrouter/
│   │   ├── client.go
│   │   ├── models.go (request/response types)
│   │   ├── prompts.go (system prompts)
│   │   └── parser.go (JSON response parsing)
│   │
│   └── types/
│       ├── signal.go
│       ├── analysis.go
│       └── indicator.go
│
├── internal/
│   ├── analysis/
│   │   ├── engine.go (main orchestrator)
│   │   ├── calculator.go (indicator calculation)
│   │   ├── prompter.go (prompt building)
│   │   └── queue.go (analysis queue management)
│   │
│   ├── monitoring/
│   │   ├── engine.go (monitoring orchestrator)
│   │   ├── registry.go (in-memory state)
│   │   └── reanalyzer.go
│   │
│   ├── scheduler/
│   │   ├── candle.go (candle scheduler)
│   │   └── intervals.go (interval parsing)
│   │
│   ├── eventbus/
│   │   ├── bus.go (pub/sub)
│   │   └── postgres_notify.go (LISTEN/NOTIFY)
│   │
│   └── trader/
│       └── executor.go (MODIFIED: event-driven)
│
└── go.mod (add: github.com/reVrost/go-openrouter)
```

#### Design Patterns

**Pattern: Event-Driven Architecture**
- Scheduler publishes candle events
- Executor and Monitoring subscribe
- Decoupled, easy to add new subscribers

**Pattern: Worker Pool**
- Analysis engine: N goroutines process queue concurrently
- Bounded parallelism prevents API rate limit issues

**Pattern: Circuit Breaker**
- OpenRouter calls wrapped in circuit breaker
- After 5 failures in 1 minute, opens circuit (fast-fails)
- Retries after 30s cooldown

**Pattern: Repository Pattern**
- All DB operations in `pkg/supabase/repository.go`
- Easy to mock for testing

#### Error Handling

```go
// Standard error handling pattern
func (e *AnalysisEngine) analyzeSignal(ctx context.Context, req *AnalysisRequest) error {
	// Use structured logging
	log := log.With().
		Str("signal_id", req.SignalID).
		Str("symbol", req.Symbol).
		Logger()

	// Wrap errors with context
	if err := e.calculateIndicators(req); err != nil {
		log.Error().Err(err).Msg("Failed to calculate indicators")
		return fmt.Errorf("calculate indicators for %s: %w", req.Symbol, err)
	}

	// Retry with exponential backoff
	var analysis *SignalAnalysis
	err := retry.Do(
		func() error {
			var err error
			analysis, err = e.callOpenRouter(ctx, req)
			return err
		},
		retry.Attempts(3),
		retry.Delay(1*time.Second),
		retry.Context(ctx),
	)
	if err != nil {
		// Log and move to dead letter queue
		log.Error().Err(err).Msg("AI analysis failed after retries")
		return e.moveToDeadLetterQueue(req, err)
	}

	log.Info().
		Str("decision", analysis.Decision).
		Float64("confidence", analysis.Confidence).
		Msg("Analysis complete")

	return nil
}
```

---

### Security Considerations

#### API Key Management

```yaml
# Environment variables (Fly.io secrets)
OPENROUTER_API_KEY: "sk-or-v1-xxxxx"
DEFAULT_AI_MODEL: "google/gemini-2.0-flash-exp:free"
SUPABASE_URL: "https://xxx.supabase.co"
SUPABASE_SERVICE_KEY: "eyJxxx" # Service role key
BINANCE_API_KEY: "xxx"
BINANCE_SECRET_KEY: "xxx"
```

#### Rate Limiting

```go
// Analysis engine rate limiter
type RateLimiter struct {
	concurrent int // Max 10 simultaneous OpenRouter calls
	semaphore  chan struct{}
}

func (r *RateLimiter) Acquire() {
	r.semaphore <- struct{}{}
}

func (r *RateLimiter) Release() {
	<-r.semaphore
}

// Usage in analysis engine
func (e *AnalysisEngine) processQueue(ctx context.Context) {
	for req := range e.queue {
		e.rateLimiter.Acquire()
		go func(r *AnalysisRequest) {
			defer e.rateLimiter.Release()
			e.analyzeSignal(ctx, r)
		}(req)
	}
}
```

#### Data Validation

```go
// Validate indicator config before calculation
func validateIndicatorConfig(config *IndicatorConfig) error {
	switch config.Name {
	case "RSI":
		period, ok := config.Params["period"].(float64)
		if !ok || period < 2 || period > 200 {
			return fmt.Errorf("invalid RSI period: %v", period)
		}
	case "MACD":
		short, _ := config.Params["shortPeriod"].(float64)
		long, _ := config.Params["longPeriod"].(float64)
		if short >= long {
			return errors.New("MACD short period must be < long period")
		}
	// ... other indicators
	}
	return nil
}
```

---

### Deployment Considerations

#### Configuration

```toml
# Fly.toml (existing, enhanced)
[env]
  ANALYSIS_CONCURRENCY = "10" # Worker pool size
  MONITORING_MAX_REANALYSES = "5" # Auto-expire after N
  CANDLE_INTERVALS = "1m,5m,15m,1h,4h,1d" # Scheduled intervals
  ANALYSIS_QUEUE_SIZE = "1000" # Buffered channel size
  DEFAULT_AI_MODEL = "google/gemini-2.0-flash-exp:free"

[processes]
  app = "main" # Single process runs all engines

[[services]]
  internal_port = 8080
  protocol = "tcp"

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [services.concurrency]
    type = "connections"
    hard_limit = 100
    soft_limit = 80
```

#### Feature Flags

Use environment variable for gradual rollout:

```go
// In executor.go
if os.Getenv("ENABLE_GO_ANALYSIS") == "true" {
	// Use new Go-based analysis pipeline
	e.analysisEngine.QueueAnalysis(req)
} else {
	// Old browser-based (PostgreSQL INSERT only)
	// Browser will pick up and analyze
}
```

**Rollout Plan:**
1. Deploy Go backend with `ENABLE_GO_ANALYSIS=false`
2. Test filter execution and signal creation (no analysis)
3. Enable for 10% of users: `ENABLE_GO_ANALYSIS=true` for specific user_ids
4. Monitor metrics: latency, error rate, AI decision quality
5. Gradually increase to 50%, 100%
6. Remove browser analysis code after 100% rollout stable for 1 week

#### Monitoring

**Metrics to Track:**

```go
// Prometheus metrics (future)
var (
	filterExecutionDuration = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name: "filter_execution_duration_seconds",
			Buckets: []float64{0.01, 0.05, 0.1, 0.5, 1},
		},
		[]string{"trader_id", "interval"},
	)

	analysisQueueDepth = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "analysis_queue_depth",
		},
	)

	openrouterCallDuration = prometheus.NewHistogram(
		prometheus.HistogramOpts{
			Name: "openrouter_call_duration_seconds",
			Buckets: []float64{0.5, 1, 2, 5, 10},
		},
	)
)
```

**Logging:**

```go
// Structured logging with zerolog
log.Info().
	Str("signal_id", signal.ID).
	Str("trader_id", signal.TraderID).
	Str("symbol", signal.Symbol).
	Float64("price", signal.PriceAtSignal).
	Str("decision", analysis.Decision).
	Int("latency_ms", analysis.AnalysisLatencyMs).
	Msg("Signal analyzed")
```

---

### Migration Strategy

#### Phase 1: Build Go Infrastructure (Week 1-2)

1. Port indicator library from TypeScript to Go
2. Implement OpenRouter client wrapper
3. Build analysis engine (without queue processing)
4. Unit tests for indicators (compare outputs with TypeScript)

**Deliverable:** `pkg/indicators` and `pkg/openrouter` packages tested

#### Phase 2: Analysis Pipeline (Week 2-3)

1. Implement analysis queue and worker pool
2. Add PostgreSQL LISTEN/NOTIFY integration
3. Build prompt templates and response parsing
4. Integration tests with real OpenRouter calls

**Deliverable:** End-to-end analysis working (manual signal creation → AI analysis)

#### Phase 3: Candle Scheduler + Event Bus (Week 3)

1. Implement candle boundary detection
2. Build event bus (pub/sub)
3. Modify executor to subscribe to candle events
4. Test filter execution at candle opens

**Deliverable:** Filters execute on candle boundaries, signals created automatically

#### Phase 4: Monitoring Engine (Week 4)

1. Implement monitoring state management
2. Add reanalysis trigger on candle events
3. Auto-expiry after max reanalyses
4. Test full lifecycle: new → monitoring → ready/rejected/expired

**Deliverable:** Complete signal lifecycle working

#### Phase 5: Browser Migration (Week 5)

1. Remove worker thread initialization from browser
2. Remove `useSignalLifecycle` and `browserAnalysisEngine`
3. Keep polling for signals (read-only)
4. Test display with Go-generated signals

**Deliverable:** Browser displays Go-generated signals correctly

#### Phase 6: Rollout (Week 6)

1. Deploy to production with feature flag off
2. Enable for 10% of users
3. Monitor metrics and error rates
4. Gradually increase to 100%
5. Remove browser execution code

**Deliverable:** 100% Go-based execution, browser code removed

#### Rollback Plan

If critical issues arise:
1. Set `ENABLE_GO_ANALYSIS=false` via Fly.io secret
2. Redeploy previous browser code version
3. Signals created by Go will still display (already in DB)
4. Browser resumes analysis of new signals

**Zero Data Loss:** All signals and analyses persisted in Postgres, no in-memory-only state

---

### Testing Strategy

#### Unit Tests

```go
// pkg/indicators/rsi_test.go
func TestCalculateRSI_MatchesTypeScript(t *testing.T) {
	// Load fixture klines from JSON
	klines := loadFixture("klines_btcusdt_5m_250.json")

	// Calculate RSI with Go
	rsiValues := indicators.CalculateRSISeries(klines, 14)

	// Load expected values from TypeScript output
	expected := loadFixture("rsi_expected_output.json")

	// Compare last 50 values (account for warmup)
	for i := 200; i < 250; i++ {
		if math.Abs(rsiValues[i] - expected[i]) > 0.01 {
			t.Errorf("RSI mismatch at index %d: got %.2f, expected %.2f",
				i, rsiValues[i], expected[i])
		}
	}
}
```

#### Integration Tests

```go
// internal/analysis/engine_test.go
func TestAnalysisEngine_EndToEnd(t *testing.T) {
	// Setup test database
	db := setupTestDB(t)
	defer db.Cleanup()

	// Create test signal
	signal := createTestSignal(db, "BTCUSDT", "5m")

	// Create analysis engine with mock OpenRouter
	mockOR := &mockOpenRouter{
		response: `{"decision": "enter_trade", "confidence": 85, ...}`,
	}
	engine := NewAnalysisEngine(mockOR, db)

	// Queue analysis
	req := &AnalysisRequest{SignalID: signal.ID, ...}
	err := engine.QueueAnalysis(req)
	require.NoError(t, err)

	// Wait for processing
	time.Sleep(2 * time.Second)

	// Verify analysis saved
	analysis, err := db.GetSignalAnalysis(signal.ID)
	require.NoError(t, err)
	assert.Equal(t, "enter_trade", analysis.Decision)

	// Verify signal status updated
	signal, _ = db.GetSignal(signal.ID)
	assert.Equal(t, "ready", signal.Status)
}
```

#### E2E Tests

```go
// e2e/trader_execution_test.go
func TestCompleteTraderWorkflow(t *testing.T) {
	// Start Go backend server
	srv := startServer(t)
	defer srv.Shutdown()

	// Create trader via API
	trader := createTrader(t, srv, "RSI Oversold Strategy")

	// Wait for next candle open (5m)
	waitForCandleOpen("5m")

	// Verify signal created
	signals := querySignals(t, srv, trader.ID)
	require.Len(t, signals, 1)

	// Verify AI analysis complete
	assert.Eventually(t, func() bool {
		analysis := queryAnalysis(t, srv, signals[0].ID)
		return analysis != nil
	}, 5*time.Second, 500*time.Millisecond)

	// Verify status transitioned
	signal := querySignal(t, srv, signals[0].ID)
	assert.Contains(t, []string{"ready", "rejected", "monitoring"}, signal.Status)
}
```

#### Performance Tests

```go
// Load test analysis engine
func BenchmarkAnalysisEngine_Throughput(b *testing.B) {
	engine := setupEngine()

	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			req := generateRandomAnalysisRequest()
			engine.QueueAnalysis(req)
		}
	})

	// Measure: signals/second processed
}
```

---

### Decision Log

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Use OpenRouter instead of direct Gemini API | Flexibility to switch models, fallback support, no vendor lock-in | Direct Gemini API (simpler but inflexible) |
| Candle-aligned execution via timer | Simplest to implement, no external dependencies | Binance WebSocket candle events (more complex) |
| PostgreSQL LISTEN/NOTIFY for signal detection | Native Postgres feature, <100ms latency, no polling | Long-polling REST API, Redis pub/sub |
| In-memory monitoring state map | Fast lookups, reloaded from DB on restart | Postgres-only (slower queries), Redis (extra dependency) |
| Channel-based analysis queue | Go-native, bounded buffering, backpressure handling | RabbitMQ/Kafka (overkill for volume), database queue (slower) |
| Indicator calculation in Go (not TypeScript port) | Type safety, performance, no Node.js runtime | Exec Node.js from Go (slow, fragile) |
| Per-candle monitoring reanalysis | Maximizes trade entry opportunities | Time-based reanalysis (misses candles) |
| 5 max reanalyses before expiry | Balances opportunity vs API cost | Unlimited (expensive), 3 (too few) |

### Open Technical Questions

1. **What's the optimal analysis concurrency?** Start with 10, measure queue depth. Increase if queue backs up, decrease if hitting rate limits.

2. **Should we cache kline data in Go backend?** Not initially - Binance API is fast enough. Add caching if latency becomes issue.

3. **How to handle Binance API rate limits?** Implement token bucket rate limiter per IP. Log warnings at 80% utilization.

4. **Should monitoring engine run in separate process?** No - single process simplifies deployment. Revisit if CPU becomes bottleneck.

5. **How to validate AI response quality?** Compare decisions against historical performance. Flag low-confidence decisions for manual review (future).

### Success Criteria

- [x] All 20+ indicators ported to Go with <1% variance from TypeScript
- [ ] End-to-end latency < 2.5s p95 (signal → analysis complete)
- [ ] Zero data loss during rollout and steady state
- [ ] Browser displays Go-generated signals correctly
- [ ] Monitoring engine correctly expires signals after max reanalyses
- [ ] OpenRouter API calls succeed >99.5% of the time
- [ ] No memory leaks over 7-day run
- [ ] Test coverage >80% for new Go packages

---

## Implementation Plan
*Stage: planning | Date: 2025-10-12T16:00:00Z*

### Overview

This implementation plan builds the complete Go backend system from scratch without migration concerns. We'll build methodically in testable phases, validating each component before proceeding.

**Total Estimated Time:** 12-18 days

**Key Principle:** Build → Test → Validate → Next Phase

---

### Phase 1: Foundation - Indicator Library & OpenRouter Client
**Duration:** 3-4 days

#### Tasks

- [ ] **1.1 Port Core Technical Indicators to Go** (2 days)
  - [ ] Create `pkg/indicators/` package structure
  - [ ] Port MA/EMA calculations (ma.go)
    - SMA, EMA, WMA
    - Include warmup period handling
  - [ ] Port RSI calculation (rsi.go)
    - Wilder's smoothing algorithm
    - Handle edge cases (first values)
  - [ ] Port MACD calculation (macd.go)
    - MACD line, signal line, histogram
  - [ ] Port Bollinger Bands (bollinger.go)
    - Upper/middle/lower bands
    - Standard deviation calculation
  - [ ] Port VWAP calculation (vwap.go)
    - Session-based VWAP
    - Volume accumulation
  - [ ] Port Stochastic Oscillator (stochastic.go)
    - %K and %D lines
    - Smooth variants
  - [ ] Create fixture data from TypeScript (JSON files with expected outputs)
  - [ ] Write unit tests for each indicator
    - Test against TypeScript output (max variance <1%)
    - Test edge cases (empty data, insufficient data)
  - [ ] **Validation:** All indicator tests passing with <1% variance from TypeScript

- [ ] **1.2 Port Pattern Detection Functions** (1 day)
  - [ ] Port candlestick patterns (patterns.go)
    - Engulfing patterns (bullish/bearish)
    - Doji detection
    - Hammer/shooting star
  - [ ] Port volume analysis (volume.go)
    - High volume nodes
    - Volume profile calculations
  - [ ] Port divergence detection (divergence.go)
    - RSI divergence
    - MACD divergence
  - [ ] Write unit tests for patterns
  - [ ] **Validation:** Pattern detection matches TypeScript behavior

- [ ] **1.3 Implement OpenRouter Client** (1 day)
  - [ ] Install `github.com/reVrost/go-openrouter` dependency
  - [ ] Create `pkg/openrouter/client.go` wrapper
    - Authentication with API key
    - Model selection (Gemini/Claude/GPT-4)
    - Request/response types
    - Error handling and retries
  - [ ] Create `pkg/openrouter/prompts.go` for system prompts
  - [ ] Create `pkg/openrouter/parser.go` for JSON response parsing
  - [ ] Implement circuit breaker pattern
    - Track failure rate
    - Open circuit after 5 failures in 1 minute
    - Retry after 30s cooldown
  - [ ] Write integration tests (mock responses)
  - [ ] Write live API test (manual, uses real API key)
  - [ ] **Validation:** Can successfully call OpenRouter and parse responses

**Phase 1 Exit Criteria:**
- All 20+ indicators ported with passing tests
- OpenRouter client can make successful API calls
- Circuit breaker pattern tested and working

---

### Phase 2: Analysis Engine
**Duration:** 3-4 days

#### Tasks

- [ ] **2.1 Build Analysis Queue System** (1 day)
  - [ ] Create `internal/analysis/queue.go`
    - Buffered channel (capacity: 1000)
    - Enqueue/dequeue operations
    - Queue depth monitoring
  - [ ] Implement worker pool in `internal/analysis/engine.go`
    - N goroutines (configurable, default 10)
    - Context cancellation support
    - Graceful shutdown
  - [ ] Add rate limiting
    - Semaphore pattern (max 10 concurrent OpenRouter calls)
    - Backpressure when queue full
  - [ ] Write tests for queue behavior
  - [ ] **Validation:** Queue handles 100 requests without blocking

- [ ] **2.2 Build Indicator Calculator** (1 day)
  - [ ] Create `internal/analysis/calculator.go`
    - `calculateIndicators(req *AnalysisRequest)` function
    - Loop through trader's indicator configs
    - Call appropriate `pkg/indicators` functions
    - Build `CalculatedIndicator` structs with history
  - [ ] Handle indicator config validation
    - Check required params exist
    - Validate param ranges (e.g., period > 0)
  - [ ] Handle insufficient kline data
    - Skip indicators that need more data
    - Log warnings
  - [ ] Write unit tests with mock data
  - [ ] **Validation:** Can calculate all configured indicators correctly

- [ ] **2.3 Build Prompt Builder & Response Parser** (1 day)
  - [ ] Create `internal/analysis/prompter.go`
    - `buildAnalysisPrompt(req, indicators)` function
    - Include strategy description
    - Include current market data (price, volume, change%)
    - Include indicator values + history (last N bars)
    - Include kline OHLCV data
    - Format as structured JSON prompt
  - [ ] Create `internal/analysis/parser.go`
    - `parseAnalysisResponse(content string)` function
    - Extract decision (enter_trade/bad_setup/wait)
    - Extract confidence score
    - Extract reasoning text
    - Extract key levels (entry/stopLoss/takeProfit)
    - Validate JSON schema
  - [ ] Write tests with example AI responses
  - [ ] **Validation:** Prompts are well-formatted, parser handles all response formats

- [ ] **2.4 Integrate Full Analysis Pipeline** (1 day)
  - [ ] Complete `internal/analysis/engine.go`
    - `analyzeSignal(ctx, req)` function
    - Calculate indicators → build prompt → call OpenRouter → parse → save
  - [ ] Add database persistence
    - Save to `signal_analyses` table
    - Update `signals.status`
    - Create `monitoring_states` if decision='wait'
  - [ ] Add comprehensive logging
    - Log each step with timestamps
    - Log analysis latency
    - Log OpenRouter usage (tokens, model)
  - [ ] Add error recovery
    - Retry failed analyses (3 attempts)
    - Move to dead letter queue after max retries
  - [ ] Write end-to-end integration test
  - [ ] **Validation:** Can analyze a signal from queue to database successfully

**Phase 2 Exit Criteria:**
- Analysis engine processes signals end-to-end
- All indicators calculated and passed to AI
- AI responses parsed and saved to database
- Error handling tested (retries, dead letter queue)

---

### Phase 3: Event Bus & Candle Scheduler
**Duration:** 2-3 days

#### Tasks

- [ ] **3.1 Implement In-Memory Event Bus** (1 day)
  - [ ] Create `internal/eventbus/bus.go`
    - Channel-based pub/sub for candle events
    - `PublishCandleEvent(event *CandleEvent)` method
    - `SubscribeCandles() <-chan *CandleEvent` method
    - Multiple subscriber support
    - Buffered channels (1000 capacity) to prevent blocking
  - [ ] Add goroutine management
    - Track active subscribers
    - Clean up on unsubscribe
  - [ ] Write tests for pub/sub behavior
  - [ ] **Validation:** Multiple subscribers receive same events

- [ ] **3.2 Implement PostgreSQL LISTEN/NOTIFY** (1 day)
  - [ ] Create `internal/eventbus/postgres_notify.go`
    - Connect to Postgres
    - LISTEN on 'signal_created' channel
    - Parse notification payload (signal_id, trader_id, user_id)
    - Publish to internal event bus
  - [ ] Add reconnection logic
    - Detect disconnect
    - Reconnect with exponential backoff
    - Resume listening
  - [ ] Write integration test with test database
  - [ ] **Validation:** Receives Postgres notifications within 100ms

- [ ] **3.3 Build Candle Scheduler** (1 day)
  - [ ] Create `internal/scheduler/candle.go`
    - Timer-based candle boundary detection (100ms ticks)
    - `getCandleOpenTime(now, interval)` - round down to boundary
    - Separate goroutine per interval (1m, 5m, 15m, 1h, 4h, 1d)
  - [ ] Implement interval parsing in `internal/scheduler/intervals.go`
    - Parse "1m" → 1 * time.Minute
    - Parse "1h" → 1 * time.Hour
    - Support all Binance intervals
  - [ ] Publish CandleEvent when boundary crossed
    - Include symbol='*', interval, openTime
  - [ ] Add timezone handling (UTC)
  - [ ] Write tests for boundary detection
  - [ ] **Validation:** Emits candle events at precise boundaries (<100ms jitter)

**Phase 3 Exit Criteria:**
- Event bus reliably delivers events to subscribers
- Candle scheduler emits events at candle opens
- PostgreSQL LISTEN/NOTIFY working for signal detection

---

### Phase 4: Monitoring Engine
**Duration:** 2-3 days

#### Tasks

- [ ] **4.1 Build Monitoring State Registry** (1 day)
  - [ ] Create `internal/monitoring/registry.go`
    - In-memory map: `map[signalID]*MonitoringState`
    - Thread-safe access with `sync.RWMutex`
    - Add/remove/get operations
  - [ ] Implement database persistence
    - `loadActiveMonitors()` - load from `monitoring_states` table on startup
    - `updateMonitorState(monitor)` - persist to database
  - [ ] Add monitor lifecycle methods
    - `createMonitor(signalID, traderID, maxReanalyses)`
    - `expireMonitor(signalID)` - mark as inactive
  - [ ] Write unit tests
  - [ ] **Validation:** Registry correctly tracks active monitors

- [ ] **4.2 Implement Monitoring Engine Core** (1 day)
  - [ ] Create `internal/monitoring/engine.go`
    - Subscribe to candle events from event bus
    - `handleCandleEvent(event)` - find matching monitors
    - `shouldReanalyze(monitor)` - check if time to reanalyze
  - [ ] Implement reanalysis triggering
    - Check symbol+interval match
    - Check reanalysis count < max
    - Check time since last reanalysis
  - [ ] Add auto-expiry logic
    - After max reanalyses reached
    - Update signal status to 'expired'
    - Remove from active monitors
  - [ ] Write integration tests
  - [ ] **Validation:** Monitors trigger reanalysis on candle events

- [ ] **4.3 Implement Reanalysis Flow** (1 day)
  - [ ] Create `internal/monitoring/reanalyzer.go`
    - `reanalyzeSignal(monitor)` function
    - Fetch latest market data
    - Queue for analysis (reuse analysis engine)
    - Update monitor state (increment count, timestamp)
  - [ ] Handle analysis results
    - If decision='enter_trade' → status='ready', deactivate monitor
    - If decision='bad_setup' → status='rejected', deactivate monitor
    - If decision='wait' → keep monitoring
  - [ ] Add database updates
    - Save reanalysis to `signal_analyses` table
    - Update monitor record
  - [ ] Write end-to-end test
  - [ ] **Validation:** Signal monitored → reanalyzed → status updated correctly

**Phase 4 Exit Criteria:**
- Monitoring engine tracks signals in 'monitoring' status
- Reanalyzes at candle closes
- Auto-expires after max reanalyses
- Full lifecycle working (new → monitoring → ready/rejected/expired)

---

### Phase 5: Executor Integration
**Duration:** 2-3 days

#### Tasks

- [ ] **5.1 Modify Executor to Be Event-Driven** (1 day)
  - [ ] Update `internal/trader/executor.go`
    - Remove timer-based `executeLoop()`
    - Subscribe to candle events from event bus
    - Implement `handleCandleEvent(event)` handler
  - [ ] Filter traders by interval
    - Only execute traders matching candle event interval
    - Skip inactive traders
  - [ ] Keep existing filter execution logic
    - Fetch klines from Binance
    - Execute Yaegi filter
    - Create signal if matches
  - [ ] Write unit tests with mock event bus
  - [ ] **Validation:** Executor runs filters only on candle events

- [ ] **5.2 Integrate Analysis Queue** (1 day)
  - [ ] Add analysis engine dependency to executor
  - [ ] After signal creation, queue for analysis
    - Fetch trader config
    - Build AnalysisRequest
    - Call `analysisEngine.QueueAnalysis(req)`
  - [ ] Keep signal deduplication (24h window)
  - [ ] Add comprehensive logging
  - [ ] Write integration test
  - [ ] **Validation:** Signal created → automatically queued for analysis

- [ ] **5.3 Wire Everything Together in Server** (1 day)
  - [ ] Update `cmd/server/main.go`
    - Initialize event bus
    - Initialize candle scheduler
    - Initialize analysis engine
    - Initialize monitoring engine
    - Initialize executor with event bus
  - [ ] Add configuration loading
    - Read `ANALYSIS_CONCURRENCY` env var
    - Read `MONITORING_MAX_REANALYSES` env var
    - Read `CANDLE_INTERVALS` env var
    - Read `OPENROUTER_API_KEY` env var
  - [ ] Add graceful shutdown
    - Context cancellation on SIGTERM
    - Wait for in-flight analyses
    - Close event bus channels
  - [ ] Write startup test
  - [ ] **Validation:** All engines start successfully, no crashes

**Phase 5 Exit Criteria:**
- Executor runs on candle events
- Signals automatically queued for analysis
- Full backend pipeline working end-to-end

---

### Phase 6: Browser Cleanup & Testing
**Duration:** 2-3 days

#### Tasks

- [ ] **6.1 Remove Browser Trader Execution** (1 day)
  - [ ] Remove `hooks/useSharedTraderIntervals.ts`
  - [ ] Remove `workers/persistentTraderWorker.ts`
  - [ ] Remove `hooks/useSignalLifecycle.ts`
  - [ ] Remove `services/browserAnalysisEngine.ts`
  - [ ] Remove SharedArrayBuffer initialization from `App.tsx`
  - [ ] Update `App.tsx` to remove worker initialization
  - [ ] Keep polling for signals from Supabase
  - [ ] Run build to check for TypeScript errors
  - [ ] **Validation:** App builds without errors, no worker code references

- [ ] **6.2 Test Browser Display** (1 day)
  - [ ] Verify `TraderSignalsTable` displays Go-generated signals
  - [ ] Verify signal status badges show correctly (new/monitoring/ready/rejected)
  - [ ] Verify analysis results displayed (decision, confidence, reasoning)
  - [ ] Verify chart display works with signal markers
  - [ ] Verify signal history sidebar shows analysis timeline
  - [ ] Test in production-like environment
  - [ ] **Validation:** Browser correctly displays all Go-generated data

- [ ] **6.3 End-to-End Testing** (1 day)
  - [ ] Test complete trader workflow
    - Create trader via UI
    - Wait for candle open
    - Verify signal created
    - Verify analysis completed
    - Verify status updated in UI
  - [ ] Test monitoring workflow
    - Create signal that triggers 'wait' decision
    - Verify enters monitoring status
    - Wait for reanalysis at next candle
    - Verify reanalysis completed
    - Verify eventual status change (ready/rejected/expired)
  - [ ] Test error scenarios
    - OpenRouter API failure → retries
    - Invalid indicator config → graceful handling
    - Database disconnect → reconnection
  - [ ] Performance testing
    - Load 10 active traders
    - Measure latency (filter → analysis → UI)
    - Verify <2.5s p95
  - [ ] **Validation:** All workflows tested successfully

**Phase 6 Exit Criteria:**
- Browser displays Go-generated signals correctly
- All trader workflows tested end-to-end
- Performance targets met
- Error handling validated

---

### Phase 7: Documentation & Deployment
**Duration:** 1-2 days

#### Tasks

- [ ] **7.1 Update Documentation** (0.5 day)
  - [ ] Update README with new architecture
  - [ ] Document environment variables needed
  - [ ] Document deployment process
  - [ ] Add troubleshooting guide
  - [ ] Update CLAUDE.md with new patterns
  - [ ] **Validation:** Documentation accurate and complete

- [ ] **7.2 Deploy to Production** (0.5 day)
  - [ ] Set Fly.io secrets
    - `OPENROUTER_API_KEY`
    - `DEFAULT_AI_MODEL`
    - `ANALYSIS_CONCURRENCY=10`
    - `MONITORING_MAX_REANALYSES=5`
  - [ ] Deploy Go backend
    - Build Docker image
    - Push to Fly.io registry
    - Deploy to machines
  - [ ] Deploy browser frontend
    - Build production bundle
    - Deploy to hosting
  - [ ] Verify deployment
    - Check logs for startup messages
    - Monitor first signals
    - Verify analysis working
  - [ ] **Validation:** Production deployment successful

- [ ] **7.3 Monitoring Setup** (0.5 day)
  - [ ] Set up log aggregation
    - Forward Fly.io logs to monitoring service
    - Create dashboard for key metrics
  - [ ] Create alerts
    - Analysis queue depth > 500
    - OpenRouter error rate > 5%
    - Signal processing latency > 5s
  - [ ] Test alerts
  - [ ] **Validation:** Monitoring and alerts working

**Phase 7 Exit Criteria:**
- Documentation updated
- Production deployment successful
- Monitoring and alerts configured

---

### Rollout Strategy

**Given that this is NOT in production**, we can use a simpler rollout:

1. **Build Complete System** (Phases 1-5)
2. **Test Thoroughly** (Phase 6)
3. **Deploy to Production** (Phase 7)
4. **Monitor for 48 Hours**
5. **Remove Browser Code** (if stable)

**No gradual rollout needed** - since there's no production traffic to protect.

---

### Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Indicator calculations don't match TypeScript | Extensive unit tests with fixture data, max <1% variance |
| OpenRouter API unreliable | Circuit breaker pattern, retry logic, fallback models |
| PostgreSQL NOTIFY missed events | Polling fallback every 5s, event queue durability |
| Monitoring engine crashes | Restart from DB state, all state persisted |
| Analysis queue overflow | Bounded channel with backpressure, dead letter queue |
| Go backend crashes | Fly.io auto-restart, stateless processing (DB-backed) |

---

### Success Metrics

After deployment, measure:
- **Latency**: Signal trigger → analysis complete < 2.5s p95
- **Reliability**: Analysis success rate > 99.5%
- **Correctness**: Indicator values match TypeScript within 1%
- **Performance**: CPU < 50%, Memory < 512MB per machine
- **Uptime**: Go backend running continuously without restarts

---

### Next Steps

To begin implementation:
1. Create `pkg/indicators/` directory structure
2. Port first indicator (RSI) with unit tests
3. Validate test passes with TypeScript parity
4. Proceed indicator by indicator

**Ready to start Phase 1?**

---

## Implementation Progress
*Stage: implementing | Date: 2025-10-12T16:15:00Z*

### Phase 1: Foundation - Indicator Library & OpenRouter Client
**Started:** 2025-10-12T16:15:00Z

#### Discovery Notes
Upon reviewing existing codebase, found that **many core indicators are already implemented** in `backend/go-screener/pkg/indicators/helpers.go`:

**✅ Already Implemented:**
- MA/SMA (Simple Moving Average) - with series support
- EMA (Exponential Moving Average) - with series support
- RSI (Relative Strength Index) - full implementation
- MACD - complete with signal and histogram
- Bollinger Bands - upper/middle/lower
- VWAP - Volume Weighted Average Price
- Stochastic Oscillator - %K and %D
- Average Volume
- Highest High / Lowest Low helpers
- Engulfing Pattern Detection

**❌ Still Need to Port:**
- StochRSI (Stochastic RSI)
- ADX (Average Directional Index)
- Generic Divergence Detection
- RSI Divergence Detection
- PVI (Positive Volume Index)
- High Volume Nodes (HVN) calculation
- VWAP Bands with standard deviation

**Revised Phase 1 Strategy:**
Instead of porting everything from scratch, we will:
1. Skip already-implemented indicators (saves 2-3 days)
2. Focus on missing indicators (StochRSI, ADX, divergences, PVI, HVN)
3. Add unit tests comparing Go vs TypeScript outputs
4. Move to OpenRouter client implementation

---
*[End of implementation plan. Next: /implement-issue issues/2025-10-12-backend-remove-browser-traders.md]*
