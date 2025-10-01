package engine

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/yourusername/aitrader-tui/internal/filter"
	"github.com/yourusername/aitrader-tui/internal/position"
	"github.com/yourusername/aitrader-tui/internal/storage"
	"github.com/yourusername/aitrader-tui/internal/timer"
	"github.com/yourusername/aitrader-tui/internal/trade"
	"github.com/yourusername/aitrader-tui/internal/types"
	"github.com/yourusername/aitrader-tui/internal/websocket"
)

// Mode represents the execution mode of the application
type Mode string

const (
	ModeLocal   Mode = "local"   // Local TUI mode
	ModeDaemon  Mode = "daemon"  // Cloud daemon mode
	ModeDeploy  Mode = "deploy"  // Deployment mode
	ModeMonitor Mode = "monitor" // Remote monitoring mode
)

// Config holds the engine configuration
type Config struct {
	UserID           string
	DatabaseURL      string
	BinanceAPIKey    string
	BinanceSecretKey string
	SupabaseURL      string
	SupabaseAnonKey  string
	PaperTradingOnly bool
	MachineID        string
	LogLevel         string
	Mode             Mode
}

// Engine is the unified trading engine that works in both local and cloud modes
type Engine struct {
	config Config
	mode   Mode
	ctx    context.Context
	cancel context.CancelFunc

	// Core components
	websocketMgr *websocket.Manager
	filterExec   *filter.Executor
	tradeExec    *trade.Executor
	posMon       *position.Monitor
	timerMgr     *timer.Manager
	storage      storage.Storage

	// Runtime state
	running      bool
	startedAt    time.Time
}

// New creates a new engine instance
func New(cfg Config) *Engine {
	ctx, cancel := context.WithCancel(context.Background())

	return &Engine{
		config: cfg,
		mode:   cfg.Mode,
		ctx:    ctx,
		cancel: cancel,
	}
}

// Start initializes and starts the trading engine
func (e *Engine) Start() error {
	log.Info().
		Str("mode", string(e.mode)).
		Str("user_id", e.config.UserID).
		Bool("paper_trading", e.config.PaperTradingOnly).
		Msg("Starting trading engine")

	if e.running {
		return fmt.Errorf("engine already running")
	}

	// Step 1: Initialize storage (SQLite for local, Supabase for cloud)
	var err error
	if e.mode == ModeLocal || e.config.DatabaseURL != "" {
		// Use SQLite for local mode
		dbPath := e.config.DatabaseURL
		if dbPath == "" {
			dbPath = "./aitrader.db"
		}
		e.storage, err = storage.NewSQLiteStorage(dbPath)
		if err != nil {
			return fmt.Errorf("failed to initialize SQLite storage: %w", err)
		}
		log.Info().Str("path", dbPath).Msg("Using SQLite storage")
	} else {
		// Use Supabase for cloud mode
		e.storage, err = storage.NewSupabaseStorage(e.config.SupabaseURL, e.config.SupabaseAnonKey)
		if err != nil {
			return fmt.Errorf("failed to initialize Supabase storage: %w", err)
		}
		log.Info().Msg("Using Supabase storage")
	}

	// Step 2: Initialize WebSocket manager
	e.websocketMgr = websocket.NewManager()
	if err := e.websocketMgr.Start(); err != nil {
		return fmt.Errorf("failed to start WebSocket manager: %w", err)
	}

	// Step 3: Initialize filter executor
	e.filterExec = filter.NewExecutor()

	// Step 4: Initialize trade executor
	e.tradeExec = trade.NewExecutor(
		e.storage,
		e.config.PaperTradingOnly,
		e.config.BinanceAPIKey,
		e.config.BinanceSecretKey,
	)
	if err := e.tradeExec.Start(); err != nil {
		return fmt.Errorf("failed to start trade executor: %w", err)
	}

	// Step 5: Initialize position monitor with callback
	e.posMon = position.NewMonitor(e.storage, e.handlePositionTrigger)
	if err := e.posMon.Start(); err != nil {
		return fmt.Errorf("failed to start position monitor: %w", err)
	}

	// Step 6: Initialize timer manager with callback
	e.timerMgr = timer.NewManager(e.handleTraderCheck)
	if err := e.timerMgr.Start(); err != nil {
		return fmt.Errorf("failed to start timer manager: %w", err)
	}

	// Step 7: Load and schedule active traders
	traders, err := e.storage.GetActiveTraders(e.ctx, e.config.UserID)
	if err != nil {
		log.Error().Err(err).Msg("Failed to load active traders")
	} else {
		log.Info().Int("count", len(traders)).Msg("Loaded active traders")

		// Subscribe to symbols
		symbols := collectSymbols(traders)
		if len(symbols) > 0 {
			if err := e.websocketMgr.SubscribeTickers(symbols); err != nil {
				log.Error().Err(err).Msg("Failed to subscribe to tickers")
			}
		}

		// Schedule traders
		for _, trader := range traders {
			// Convert storage.Trader to types.Trader
			t := convertStorageTrader(&trader)

			// Compile filter
			if err := e.filterExec.CompileFilter(t); err != nil {
				log.Error().Err(err).Str("trader_id", t.ID).Msg("Failed to compile filter")
				continue
			}

			// Schedule checks
			if err := e.timerMgr.ScheduleTrader(t); err != nil {
				log.Error().Err(err).Str("trader_id", t.ID).Msg("Failed to schedule trader")
			}
		}
	}

	// Step 8: Load and monitor open positions
	positions, err := e.storage.GetOpenPositions(e.ctx, e.config.UserID)
	if err != nil {
		log.Error().Err(err).Msg("Failed to load open positions")
	} else {
		log.Info().Int("count", len(positions)).Msg("Loaded open positions")
		for _, pos := range positions {
			p := convertStoragePosition(&pos)
			e.posMon.AddPosition(p)
		}
	}

	// Step 9: Start WebSocket event processing
	go e.processWebSocketEvents()

	e.running = true
	e.startedAt = time.Now()

	log.Info().Msg("Trading engine started successfully")

	return nil
}

// Stop gracefully shuts down the engine
func (e *Engine) Stop() {
	log.Info().Msg("Stopping trading engine...")

	if !e.running {
		log.Warn().Msg("Engine not running")
		return
	}

	e.running = false

	// Stop all components in reverse order
	if e.timerMgr != nil {
		e.timerMgr.Stop()
	}

	if e.posMon != nil {
		e.posMon.Stop()
	}

	if e.tradeExec != nil {
		e.tradeExec.Stop()
	}

	if e.filterExec != nil {
		e.filterExec.Stop()
	}

	if e.websocketMgr != nil {
		e.websocketMgr.Stop()
	}

	if e.storage != nil {
		e.storage.Close()
	}

	e.cancel()

	log.Info().Msg("Trading engine stopped")
}

// GetStatus returns the current engine status
func (e *Engine) GetStatus() map[string]interface{} {
	status := map[string]interface{}{
		"mode":              string(e.mode),
		"running":           e.running,
		"user_id":           e.config.UserID,
		"paper_trading":     e.config.PaperTradingOnly,
	}

	if e.running {
		status["started_at"] = e.startedAt
		status["uptime_seconds"] = time.Since(e.startedAt).Seconds()
	}

	if e.timerMgr != nil {
		status["active_traders"] = e.timerMgr.GetScheduledCount()
	}

	if e.posMon != nil {
		status["open_positions"] = e.posMon.GetPositionCount()
		status["total_pnl"] = e.posMon.GetTotalPnL()
	}

	if e.websocketMgr != nil {
		status["websocket_status"] = e.websocketMgr.GetStatus()
	}

	return status
}

// DetectMode determines the execution mode based on environment
func DetectMode(daemon, deploy, monitor bool) Mode {
	// Check if running on Fly.io
	if os.Getenv("FLY_APP_NAME") != "" {
		return ModeDaemon
	}

	// Check command-line flags
	if deploy {
		return ModeDeploy
	}
	if monitor {
		return ModeMonitor
	}
	if daemon {
		return ModeDaemon
	}

	// Default to local TUI mode
	return ModeLocal
}

// Helper functions and callbacks

// handleTraderCheck is called when a trader timer fires
func (e *Engine) handleTraderCheck(traderID string) error {
	log.Debug().Str("trader_id", traderID).Msg("Trader check triggered")

	// Get trader from storage
	trader, err := e.storage.GetTrader(e.ctx, traderID)
	if err != nil {
		return fmt.Errorf("failed to get trader: %w", err)
	}

	if trader == nil {
		log.Warn().Str("trader_id", traderID).Msg("Trader not found")
		return nil
	}

	// Convert to types.Trader
	t := convertStorageTrader(trader)

	// Get market data snapshot
	snapshot := e.websocketMgr.GetSnapshot()

	// Execute filter
	result, err := e.filterExec.ExecuteFilter(t, snapshot)
	if err != nil {
		log.Error().Err(err).Str("trader_id", traderID).Msg("Filter execution failed")
		return err
	}

	log.Info().
		Str("trader_id", traderID).
		Int("matches", len(result.Matches)).
		Msg("Filter executed")

	// TODO: Process matches (create signals, trigger AI analysis, etc.)
	// This would be implemented in a future phase

	return nil
}

// handlePositionTrigger is called when a stop loss or take profit is triggered
func (e *Engine) handlePositionTrigger(position *types.Position, triggerType string, currentPrice float64) error {
	log.Info().
		Str("position_id", position.ID).
		Str("trigger", triggerType).
		Float64("price", currentPrice).
		Msg("Position trigger fired")

	// Execute exit order
	if err := e.tradeExec.ExecuteExit(position, triggerType, currentPrice); err != nil {
		log.Error().
			Err(err).
			Str("position_id", position.ID).
			Msg("Failed to execute exit order")
		return err
	}

	// Remove from monitor
	e.posMon.RemovePosition(position.ID)

	return nil
}

// processWebSocketEvents processes WebSocket events
func (e *Engine) processWebSocketEvents() {
	eventChan := e.websocketMgr.GetEventChannel()

	for {
		select {
		case <-e.ctx.Done():
			return

		case event := <-eventChan:
			if event == nil {
				return
			}

			switch event.Type {
			case "ticker":
				// Update position prices
				if ticker, ok := event.Data.(*types.Ticker); ok {
					var price float64
					fmt.Sscanf(ticker.LastPrice, "%f", &price)
					if price > 0 {
						e.posMon.UpdatePrice(ticker.Symbol, price)
					}
				}

			case "error":
				log.Error().Str("error", event.Error).Msg("WebSocket error")
			}
		}
	}
}

// convertStorageTrader converts storage.Trader to types.Trader
func convertStorageTrader(t *storage.Trader) *types.Trader {
	// Parse check interval (e.g., "5m" -> 300 seconds)
	intervalSec := 300 // Default 5 minutes
	// TODO: Parse t.CheckInterval properly

	return &types.Trader{
		ID:               t.ID,
		UserID:           t.UserID,
		Name:             t.Name,
		Description:      t.Description,
		Filter: types.TraderFilter{
			Code:       t.SignalCode,
			Timeframes: t.Timeframes,
		},
		CheckIntervalSec: intervalSec,
		Active:           t.Status == "active",
		CreatedAt:        t.CreatedAt,
		UpdatedAt:        t.UpdatedAt,
	}
}

// convertStoragePosition converts storage.Position to types.Position
func convertStoragePosition(p *storage.Position) *types.Position {
	side := types.PositionSideLong
	if p.Side == "SHORT" {
		side = types.PositionSideShort
	}

	status := types.PositionStatusOpen
	if p.Status == "closed" {
		status = types.PositionStatusClosed
	}

	return &types.Position{
		ID:            p.ID,
		SignalID:      p.SignalID,
		TraderID:      p.TraderID,
		UserID:        p.UserID,
		Symbol:        p.Symbol,
		Side:          side,
		Status:        status,
		EntryPrice:    p.EntryPrice,
		CurrentPrice:  p.CurrentPrice,
		Quantity:      p.Size,
		StopLoss:      p.StopLoss,
		TakeProfit:    p.TakeProfit,
		UnrealizedPnL: p.PNL,
		PnLPercent:    p.PNLPct,
		IsPaperTrade:  true, // Will be set based on config
		CreatedAt:     p.CreatedAt,
		UpdatedAt:     p.UpdatedAt,
		ClosedAt:      p.ClosedAt,
	}
}

func collectSymbols(traders []storage.Trader) []string {
	symbolMap := make(map[string]bool)

	// Collect all unique symbols from traders
	for _, trader := range traders {
		for _, symbol := range trader.Symbols {
			symbolMap[symbol] = true
		}
	}

	// Convert to slice
	symbols := make([]string, 0, len(symbolMap))
	for symbol := range symbolMap {
		symbols = append(symbols, symbol)
	}

	// If no symbols, use defaults
	if len(symbols) == 0 {
		symbols = []string{
			"BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "ADAUSDT",
			"XRPUSDT", "DOTUSDT", "DOGEUSDT", "MATICUSDT", "AVAXUSDT",
		}
	}

	return symbols
}

func collectTimeframes(traders []storage.Trader) []string {
	timeframeMap := make(map[string]bool)

	// Collect all unique timeframes from traders
	for _, trader := range traders {
		for _, tf := range trader.Timeframes {
			timeframeMap[tf] = true
		}
	}

	// Convert to slice
	timeframes := make([]string, 0, len(timeframeMap))
	for tf := range timeframeMap {
		timeframes = append(timeframes, tf)
	}

	// If no timeframes, use defaults
	if len(timeframes) == 0 {
		timeframes = []string{"1m", "5m", "15m", "1h"}
	}

	return timeframes
}

func parseFloat(s string, f *float64) (int, error) {
	n, err := fmt.Sscanf(s, "%f", f)
	return n, err
}
