package monitor

import (
	"context"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/yourusername/trader-machine/internal/database"
	"github.com/yourusername/trader-machine/internal/events"
	"github.com/yourusername/trader-machine/internal/executor"
	"github.com/yourusername/trader-machine/internal/types"
)

// PositionMonitor checks positions for SL/TP triggers
type PositionMonitor struct {
	db            *database.Client
	eventBus      *events.Bus
	tradeExecutor *executor.TradeExecutor
	positions     map[string]*types.Position
	priceFeeds    map[string]float64 // symbol -> current price
	mu            sync.RWMutex
	stopCh        chan struct{}
	checkInterval time.Duration
}

// NewPositionMonitor creates a new position monitor
func NewPositionMonitor(db *database.Client, eventBus *events.Bus, tradeExecutor *executor.TradeExecutor) *PositionMonitor {
	return &PositionMonitor{
		db:            db,
		eventBus:      eventBus,
		tradeExecutor: tradeExecutor,
		positions:     make(map[string]*types.Position),
		priceFeeds:    make(map[string]float64),
		stopCh:        make(chan struct{}),
		checkInterval: time.Second, // Check every 1 second
	}
}

// AddPosition adds a position to monitor
func (pm *PositionMonitor) AddPosition(position *types.Position) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	pm.positions[position.ID] = position

	log.Info().
		Str("position_id", position.ID).
		Str("symbol", position.Symbol).
		Str("side", position.Side).
		Float64("entry_price", position.EntryPrice).
		Float64("stop_loss", position.StopLoss).
		Float64("take_profit", position.TakeProfit).
		Msg("Position added to monitor")
}

// RemovePosition removes a position from monitoring
func (pm *PositionMonitor) RemovePosition(positionID string) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	delete(pm.positions, positionID)

	log.Info().
		Str("position_id", positionID).
		Msg("Position removed from monitor")
}

// UpdatePrice updates the current price for a symbol
func (pm *PositionMonitor) UpdatePrice(symbol string, price float64) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	pm.priceFeeds[symbol] = price
}

// Start begins the monitoring loop
func (pm *PositionMonitor) Start() {
	ticker := time.NewTicker(pm.checkInterval)
	defer ticker.Stop()

	log.Info().
		Dur("interval", pm.checkInterval).
		Msg("Position monitor started")

	for {
		select {
		case <-ticker.C:
			pm.checkPositions()
		case <-pm.stopCh:
			log.Info().Msg("Position monitor stopped")
			return
		}
	}
}

// Stop stops the monitoring loop
func (pm *PositionMonitor) Stop() {
	close(pm.stopCh)
}

// checkPositions checks all positions for SL/TP triggers
func (pm *PositionMonitor) checkPositions() {
	pm.mu.RLock()
	positions := make([]*types.Position, 0, len(pm.positions))
	for _, pos := range pm.positions {
		positions = append(positions, pos)
	}
	pm.mu.RUnlock()

	for _, position := range positions {
		pm.checkPosition(position)
	}
}

// checkPosition checks a single position for triggers
func (pm *PositionMonitor) checkPosition(position *types.Position) {
	pm.mu.RLock()
	currentPrice, ok := pm.priceFeeds[position.Symbol]
	pm.mu.RUnlock()

	if !ok {
		log.Debug().
			Str("position_id", position.ID).
			Str("symbol", position.Symbol).
			Msg("No price feed available for position")
		return
	}

	// Calculate current PNL
	pnl, pnlPercent := pm.calculatePNL(position, currentPrice)

	// Check stop-loss trigger
	if position.StopLoss > 0 && pm.isStopLossTriggered(position, currentPrice) {
		log.Info().
			Time("timestamp", time.Now()).
			Str("position_id", position.ID).
			Str("symbol", position.Symbol).
			Float64("current_price", currentPrice).
			Float64("stop_loss", position.StopLoss).
			Float64("pnl", pnl).
			Float64("pnl_percent", pnlPercent).
			Msg("Stop-loss triggered")

		pm.closePositionOnTrigger(position, currentPrice, pnl, pnlPercent, "stop_loss")
		return
	}

	// Check take-profit trigger
	if position.TakeProfit > 0 && pm.isTakeProfitTriggered(position, currentPrice) {
		log.Info().
			Time("timestamp", time.Now()).
			Str("position_id", position.ID).
			Str("symbol", position.Symbol).
			Float64("current_price", currentPrice).
			Float64("take_profit", position.TakeProfit).
			Float64("pnl", pnl).
			Float64("pnl_percent", pnlPercent).
			Msg("Take-profit triggered")

		pm.closePositionOnTrigger(position, currentPrice, pnl, pnlPercent, "take_profit")
		return
	}

	// Check trailing stop if configured
	if trailingStop, ok := position.Metadata["trailingStop"].(float64); ok && trailingStop > 0 {
		pm.checkTrailingStop(position, currentPrice, trailingStop)
	}

	// Log significant PNL changes (every 5%)
	if pnlPercent != 0 && int(pnlPercent)%5 == 0 {
		log.Debug().
			Str("position_id", position.ID).
			Str("symbol", position.Symbol).
			Float64("current_price", currentPrice).
			Float64("pnl", pnl).
			Float64("pnl_percent", pnlPercent).
			Msg("Position PNL update")
	}
}

// isStopLossTriggered checks if stop-loss is triggered
func (pm *PositionMonitor) isStopLossTriggered(position *types.Position, currentPrice float64) bool {
	if position.Side == "long" {
		// Long position: trigger when price drops below SL
		return currentPrice <= position.StopLoss
	}
	// Short position: trigger when price rises above SL
	return currentPrice >= position.StopLoss
}

// isTakeProfitTriggered checks if take-profit is triggered
func (pm *PositionMonitor) isTakeProfitTriggered(position *types.Position, currentPrice float64) bool {
	if position.Side == "long" {
		// Long position: trigger when price rises above TP
		return currentPrice >= position.TakeProfit
	}
	// Short position: trigger when price drops below TP
	return currentPrice <= position.TakeProfit
}

// checkTrailingStop checks and updates trailing stop
func (pm *PositionMonitor) checkTrailingStop(position *types.Position, currentPrice, trailingDistance float64) {
	var newStopLoss float64

	if position.Side == "long" {
		// Long position: move SL up as price rises
		newStopLoss = currentPrice - trailingDistance
		if newStopLoss > position.StopLoss {
			log.Info().
				Str("position_id", position.ID).
				Float64("old_sl", position.StopLoss).
				Float64("new_sl", newStopLoss).
				Msg("Trailing stop updated (long)")

			if err := pm.tradeExecutor.UpdateStopLoss(context.Background(), position, newStopLoss); err != nil {
				log.Error().
					Err(err).
					Str("position_id", position.ID).
					Msg("Failed to update trailing stop")
			} else {
				position.StopLoss = newStopLoss
			}
		}
	} else {
		// Short position: move SL down as price drops
		newStopLoss = currentPrice + trailingDistance
		if newStopLoss < position.StopLoss || position.StopLoss == 0 {
			log.Info().
				Str("position_id", position.ID).
				Float64("old_sl", position.StopLoss).
				Float64("new_sl", newStopLoss).
				Msg("Trailing stop updated (short)")

			if err := pm.tradeExecutor.UpdateStopLoss(context.Background(), position, newStopLoss); err != nil {
				log.Error().
					Err(err).
					Str("position_id", position.ID).
					Msg("Failed to update trailing stop")
			} else {
				position.StopLoss = newStopLoss
			}
		}
	}
}

// closePositionOnTrigger closes a position when SL/TP is triggered
func (pm *PositionMonitor) closePositionOnTrigger(position *types.Position, exitPrice, pnl, pnlPercent float64, reason string) {
	ctx := context.Background()

	// Create decision for close
	decision := &types.Decision{
		Decision:   "close",
		Reasoning:  "Position closed by " + reason + " trigger",
		Confidence: 100,
		Metadata:   map[string]interface{}{"trigger": reason},
	}

	// Execute close trade
	if err := pm.tradeExecutor.ExecuteTrade(ctx, nil, position, decision); err != nil {
		log.Error().
			Err(err).
			Str("position_id", position.ID).
			Str("reason", reason).
			Msg("Failed to close position on trigger")
		return
	}

	// Remove from monitoring
	pm.RemovePosition(position.ID)

	// Publish event
	pm.eventBus.PublishPositionClosed(position)

	log.Info().
		Time("timestamp", time.Now()).
		Str("position_id", position.ID).
		Str("symbol", position.Symbol).
		Str("reason", reason).
		Float64("exit_price", exitPrice).
		Float64("pnl", pnl).
		Float64("pnl_percent", pnlPercent).
		Msg("Position auto-closed")
}

// calculatePNL calculates current PNL for a position
func (pm *PositionMonitor) calculatePNL(position *types.Position, currentPrice float64) (pnl, pnlPercent float64) {
	if position.Side == "long" {
		pnl = (currentPrice - position.EntryPrice) * position.Size
	} else {
		pnl = (position.EntryPrice - currentPrice) * position.Size
	}

	pnlPercent = (pnl / (position.EntryPrice * position.Size)) * 100
	return pnl, pnlPercent
}

// GetPositionPNL returns current PNL for a position
func (pm *PositionMonitor) GetPositionPNL(positionID string) (pnl, pnlPercent float64, ok bool) {
	pm.mu.RLock()
	position, posExists := pm.positions[positionID]
	if !posExists {
		pm.mu.RUnlock()
		return 0, 0, false
	}

	currentPrice, priceExists := pm.priceFeeds[position.Symbol]
	pm.mu.RUnlock()

	if !priceExists {
		return 0, 0, false
	}

	pnl, pnlPercent = pm.calculatePNL(position, currentPrice)
	return pnl, pnlPercent, true
}

// GetAllPositions returns all monitored positions with current PNL
func (pm *PositionMonitor) GetAllPositions() []types.PositionStatus {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	statuses := make([]types.PositionStatus, 0, len(pm.positions))

	for _, position := range pm.positions {
		status := types.PositionStatus{
			Position: *position,
		}

		if currentPrice, ok := pm.priceFeeds[position.Symbol]; ok {
			pnl, pnlPercent := pm.calculatePNL(position, currentPrice)
			status.CurrentPrice = currentPrice
			status.CurrentPNL = pnl
			status.CurrentPNLPercent = pnlPercent
		}

		statuses = append(statuses, status)
	}

	return statuses
}
