package reanalysis

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/yourusername/trader-machine/internal/database"
	"github.com/yourusername/trader-machine/internal/events"
	"github.com/yourusername/trader-machine/internal/executor"
	"github.com/yourusername/trader-machine/internal/storage"
	"github.com/yourusername/trader-machine/internal/types"
)

// Manager handles periodic re-analysis of signals and positions
type Manager struct {
	db                *database.Client
	klineStore        *storage.KlineStore
	eventBus          *events.Bus
	tradeExecutor     *executor.TradeExecutor
	edgeFunctionURL   string
	traders           map[string]*types.Trader
	timers            map[string]*time.Ticker
	stopChannels      map[string]chan struct{}
	priceFeeds        map[string]float64
	mu                sync.RWMutex
}

// NewManager creates a new re-analysis manager
func NewManager(db *database.Client, klineStore *storage.KlineStore, eventBus *events.Bus, tradeExecutor *executor.TradeExecutor, edgeFunctionURL string) *Manager {
	return &Manager{
		db:              db,
		klineStore:      klineStore,
		eventBus:        eventBus,
		tradeExecutor:   tradeExecutor,
		edgeFunctionURL: edgeFunctionURL,
		traders:         make(map[string]*types.Trader),
		timers:          make(map[string]*time.Ticker),
		stopChannels:    make(map[string]chan struct{}),
		priceFeeds:      make(map[string]float64),
	}
}

// AddTrader adds a trader for re-analysis
func (rm *Manager) AddTrader(trader *types.Trader) error {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	interval, err := parseInterval(trader.ReanalysisInterval)
	if err != nil {
		return err
	}

	ticker := time.NewTicker(interval)
	stopCh := make(chan struct{})

	rm.traders[trader.ID] = trader
	rm.timers[trader.ID] = ticker
	rm.stopChannels[trader.ID] = stopCh

	go rm.run(trader, ticker, stopCh)

	log.Info().
		Str("trader_id", trader.ID).
		Str("interval", trader.ReanalysisInterval).
		Msg("Trader re-analysis started")

	return nil
}

// RemoveTrader removes a trader from re-analysis
func (rm *Manager) RemoveTrader(traderID string) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	if ticker, ok := rm.timers[traderID]; ok {
		ticker.Stop()
	}

	if stopCh, ok := rm.stopChannels[traderID]; ok {
		close(stopCh)
	}

	delete(rm.traders, traderID)
	delete(rm.timers, traderID)
	delete(rm.stopChannels, traderID)

	log.Info().
		Str("trader_id", traderID).
		Msg("Trader re-analysis stopped")
}

// UpdatePrice updates the current price for a symbol
func (rm *Manager) UpdatePrice(symbol string, price float64) {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	rm.priceFeeds[symbol] = price
}

// StopAll stops all re-analysis timers
func (rm *Manager) StopAll() {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	for _, ticker := range rm.timers {
		ticker.Stop()
	}

	for _, stopCh := range rm.stopChannels {
		close(stopCh)
	}

	log.Info().Msg("All re-analysis timers stopped")
}

// run executes re-analysis on timer intervals
func (rm *Manager) run(trader *types.Trader, ticker *time.Ticker, stopCh chan struct{}) {
	for {
		select {
		case <-ticker.C:
			rm.reanalyze(trader)
		case <-stopCh:
			return
		}
	}
}

// reanalyze performs re-analysis for a trader
func (rm *Manager) reanalyze(trader *types.Trader) {
	ctx := context.Background()
	startTime := time.Now()

	log.Info().
		Time("timestamp", startTime).
		Str("trader_id", trader.ID).
		Msg("Starting re-analysis")

	// Re-analyze watching signals
	watchingSignals, err := rm.db.GetWatchingSignals(ctx, trader.ID)
	if err != nil {
		log.Error().
			Err(err).
			Str("trader_id", trader.ID).
			Msg("Failed to get watching signals")
		return
	}

	for _, signal := range watchingSignals {
		if err := rm.reanalyzeSignal(ctx, trader, &signal); err != nil {
			log.Error().
				Err(err).
				Str("signal_id", signal.ID).
				Msg("Failed to re-analyze signal")
		}
	}

	// Re-analyze open positions
	openPositions, err := rm.db.GetOpenPositions(ctx, trader.UserID)
	if err != nil {
		log.Error().
			Err(err).
			Str("trader_id", trader.ID).
			Msg("Failed to get open positions")
		return
	}

	for _, position := range openPositions {
		if position.SignalID != "" {
			signal, err := rm.db.GetSignal(ctx, position.SignalID)
			if err != nil {
				log.Error().
					Err(err).
					Str("position_id", position.ID).
					Msg("Failed to get signal for position")
				continue
			}

			if err := rm.reanalyzePosition(ctx, trader, signal, &position); err != nil {
				log.Error().
					Err(err).
					Str("position_id", position.ID).
					Msg("Failed to re-analyze position")
			}
		}
	}

	log.Info().
		Time("timestamp", time.Now()).
		Str("trader_id", trader.ID).
		Int("watching_signals", len(watchingSignals)).
		Int("open_positions", len(openPositions)).
		Dur("duration", time.Since(startTime)).
		Msg("Re-analysis completed")
}

// reanalyzeSignal re-analyzes a watching signal
func (rm *Manager) reanalyzeSignal(ctx context.Context, trader *types.Trader, signal *types.Signal) error {
	// Get current market data
	marketData, err := rm.getMarketData(signal.Symbol, trader.Timeframes)
	if err != nil {
		return fmt.Errorf("failed to get market data: %w", err)
	}

	// Call Supabase Edge Function for analysis
	decision, err := rm.analyzeWithGemini(ctx, trader.ID, signal.ID, marketData)
	if err != nil {
		return fmt.Errorf("failed to analyze with Gemini: %w", err)
	}

	// Update current price in signal
	rm.mu.RLock()
	currentPrice := rm.priceFeeds[signal.Symbol]
	rm.mu.RUnlock()

	if currentPrice > 0 {
		if err := rm.db.UpdateSignal(ctx, signal.ID, signal.Status, currentPrice); err != nil {
			log.Error().
				Err(err).
				Str("signal_id", signal.ID).
				Msg("Failed to update signal price")
		}
	}

	// Save analysis to history
	if err := rm.db.CreateAnalysis(ctx, signal.ID, trader.ID, trader.UserID, decision.Decision, decision.Reasoning, decision.Confidence, map[string]interface{}{
		"symbol":    signal.Symbol,
		"timestamp": time.Now().Unix(),
	}, decision.Metadata); err != nil {
		log.Error().
			Err(err).
			Str("signal_id", signal.ID).
			Msg("Failed to save analysis")
	}

	// Process decision
	switch decision.Decision {
	case "open_long", "open_short":
		log.Info().
			Str("signal_id", signal.ID).
			Str("symbol", signal.Symbol).
			Str("decision", decision.Decision).
			Msg("Opening position from re-analysis")

		// Execute trade
		if err := rm.tradeExecutor.ExecuteTrade(ctx, signal, nil, decision); err != nil {
			return fmt.Errorf("failed to execute trade: %w", err)
		}

		// Publish event
		rm.eventBus.PublishAnalysisCompleted(signal.ID, decision.Decision)

	case "close_watch":
		log.Info().
			Str("signal_id", signal.ID).
			Str("symbol", signal.Symbol).
			Msg("Closing watch from re-analysis")

		if err := rm.db.CloseSignal(ctx, signal.ID, "ai_recommendation"); err != nil {
			return fmt.Errorf("failed to close signal: %w", err)
		}

	default:
		log.Debug().
			Str("signal_id", signal.ID).
			Str("decision", decision.Decision).
			Msg("No action taken from re-analysis")
	}

	return nil
}

// reanalyzePosition re-analyzes an open position
func (rm *Manager) reanalyzePosition(ctx context.Context, trader *types.Trader, signal *types.Signal, position *types.Position) error {
	// Get current market data
	marketData, err := rm.getMarketData(position.Symbol, trader.Timeframes)
	if err != nil {
		return fmt.Errorf("failed to get market data: %w", err)
	}

	// Call Supabase Edge Function for analysis
	decision, err := rm.analyzeWithGemini(ctx, trader.ID, signal.ID, marketData)
	if err != nil {
		return fmt.Errorf("failed to analyze with Gemini: %w", err)
	}

	// Save analysis to history
	if err := rm.db.CreateAnalysis(ctx, signal.ID, trader.ID, trader.UserID, decision.Decision, decision.Reasoning, decision.Confidence, map[string]interface{}{
		"symbol":      position.Symbol,
		"position_id": position.ID,
		"timestamp":   time.Now().Unix(),
	}, decision.Metadata); err != nil {
		log.Error().
			Err(err).
			Str("position_id", position.ID).
			Msg("Failed to save analysis")
	}

	// Process decision
	switch decision.Decision {
	case "close", "partial_close", "scale_in", "scale_out", "flip_position":
		log.Info().
			Str("position_id", position.ID).
			Str("symbol", position.Symbol).
			Str("decision", decision.Decision).
			Msg("Executing position action from re-analysis")

		if err := rm.tradeExecutor.ExecuteTrade(ctx, signal, position, decision); err != nil {
			return fmt.Errorf("failed to execute trade: %w", err)
		}

		rm.eventBus.PublishAnalysisCompleted(signal.ID, decision.Decision)

	case "update_stop_loss":
		if newStopLoss, ok := decision.Metadata["stopLoss"].(float64); ok {
			log.Info().
				Str("position_id", position.ID).
				Float64("new_stop_loss", newStopLoss).
				Msg("Updating stop-loss from re-analysis")

			if err := rm.tradeExecutor.UpdateStopLoss(ctx, position, newStopLoss); err != nil {
				return fmt.Errorf("failed to update stop-loss: %w", err)
			}
		}

	case "update_take_profit":
		if newTakeProfit, ok := decision.Metadata["takeProfit"].(float64); ok {
			log.Info().
				Str("position_id", position.ID).
				Float64("new_take_profit", newTakeProfit).
				Msg("Updating take-profit from re-analysis")

			if err := rm.tradeExecutor.UpdateTakeProfit(ctx, position, newTakeProfit); err != nil {
				return fmt.Errorf("failed to update take-profit: %w", err)
			}
		}

	default:
		log.Debug().
			Str("position_id", position.ID).
			Str("decision", decision.Decision).
			Msg("No action taken from re-analysis")
	}

	return nil
}

// getMarketData retrieves current market data for analysis
func (rm *Manager) getMarketData(symbol string, timeframes []string) (types.MarketData, error) {
	rm.mu.RLock()
	currentPrice := rm.priceFeeds[symbol]
	rm.mu.RUnlock()

	// Build ticker data
	ticker := map[string]interface{}{
		"lastPrice": fmt.Sprintf("%.8f", currentPrice),
		"symbol":    symbol,
	}

	// Get klines for all timeframes
	klines := make(map[string][][]interface{})
	for _, tf := range timeframes {
		klines[tf] = rm.klineStore.Get(symbol, tf, 100)
	}

	return types.MarketData{
		Symbol:     symbol,
		Timestamp:  time.Now().Unix(),
		Ticker:     ticker,
		Klines:     klines,
		Indicators: make(map[string]interface{}), // Would calculate indicators if needed
	}, nil
}

// analyzeWithGemini calls Supabase Edge Function for AI analysis
func (rm *Manager) analyzeWithGemini(ctx context.Context, traderID, signalID string, marketData types.MarketData) (*types.Decision, error) {
	reqBody := types.AnalysisRequest{
		TraderID:   traderID,
		SignalID:   signalID,
		MarketData: marketData,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", rm.edgeFunctionURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to call edge function: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("edge function returned status %d: %s", resp.StatusCode, string(body))
	}

	var analysisResp types.AnalysisResponse
	if err := json.Unmarshal(body, &analysisResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	if !analysisResp.Success {
		return nil, fmt.Errorf("analysis failed: %s", analysisResp.Error)
	}

	log.Debug().
		Str("trader_id", traderID).
		Str("signal_id", signalID).
		Str("decision", analysisResp.Analysis.Decision).
		Int("confidence", analysisResp.Analysis.Confidence).
		Msg("Gemini analysis completed")

	return &analysisResp.Analysis, nil
}

// parseInterval converts interval string to duration
func parseInterval(interval string) (time.Duration, error) {
	switch interval {
	case "1m":
		return time.Minute, nil
	case "5m":
		return 5 * time.Minute, nil
	case "15m":
		return 15 * time.Minute, nil
	case "30m":
		return 30 * time.Minute, nil
	case "1h":
		return time.Hour, nil
	case "4h":
		return 4 * time.Hour, nil
	case "1d":
		return 24 * time.Hour, nil
	default:
		return 5 * time.Minute, fmt.Errorf("unknown interval: %s", interval)
	}
}
