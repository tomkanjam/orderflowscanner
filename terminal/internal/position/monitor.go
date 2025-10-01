package position

import (
	"context"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/yourusername/aitrader-tui/internal/helpers"
	"github.com/yourusername/aitrader-tui/internal/storage"
	"github.com/yourusername/aitrader-tui/internal/types"
)

const (
	// Monitor interval
	monitorInterval = 1 * time.Second
)

// TriggerCallback is called when a stop loss or take profit is triggered
type TriggerCallback func(position *types.Position, triggerType string, currentPrice float64) error

// Monitor monitors open positions for stop loss and take profit triggers
type Monitor struct {
	mu sync.RWMutex

	// Dependencies
	storage  storage.Storage
	callback TriggerCallback

	// State
	positions map[string]*types.Position // positionID -> position
	ctx       context.Context
	cancel    context.CancelFunc
	wg        sync.WaitGroup
	running   bool
}

// NewMonitor creates a new position monitor
func NewMonitor(storage storage.Storage, callback TriggerCallback) *Monitor {
	ctx, cancel := context.WithCancel(context.Background())

	return &Monitor{
		ctx:       ctx,
		cancel:    cancel,
		storage:   storage,
		callback:  callback,
		positions: make(map[string]*types.Position),
		running:   false,
	}
}

// Start starts the position monitor
func (m *Monitor) Start() error {
	m.mu.Lock()
	if m.running {
		m.mu.Unlock()
		return nil
	}
	m.running = true
	m.mu.Unlock()

	log.Info().Msg("Position monitor started")

	// Load existing open positions from storage
	if err := m.loadOpenPositions(); err != nil {
		log.Error().Err(err).Msg("Failed to load open positions")
	}

	// Start monitoring loop
	m.wg.Add(1)
	go m.monitorLoop()

	return nil
}

// Stop stops the position monitor
func (m *Monitor) Stop() error {
	m.mu.Lock()
	if !m.running {
		m.mu.Unlock()
		return nil
	}
	m.running = false
	m.mu.Unlock()

	log.Info().Msg("Stopping position monitor")

	m.cancel()
	m.wg.Wait()

	log.Info().Msg("Position monitor stopped")

	return nil
}

// AddPosition adds a position to monitor
func (m *Monitor) AddPosition(position *types.Position) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.positions[position.ID] = position

	log.Info().
		Str("position_id", position.ID).
		Str("symbol", position.Symbol).
		Float64("entry", position.EntryPrice).
		Float64("stop_loss", position.StopLoss).
		Float64("take_profit", position.TakeProfit).
		Msg("Position added to monitor")
}

// RemovePosition removes a position from monitoring
func (m *Monitor) RemovePosition(positionID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.positions, positionID)

	log.Info().Str("position_id", positionID).Msg("Position removed from monitor")
}

// UpdatePrice updates the current price for a position
func (m *Monitor) UpdatePrice(symbol string, price float64) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, position := range m.positions {
		if position.Symbol == symbol {
			// Update current price
			oldPrice := position.CurrentPrice
			position.CurrentPrice = price

			// Calculate unrealized PnL
			isLong := position.Side == types.PositionSideLong
			position.UnrealizedPnL = helpers.CalculatePnL(position.EntryPrice, price, position.Quantity, isLong)
			position.PnLPercent = helpers.CalculatePnLPercent(position.EntryPrice, price, isLong)
			position.UpdatedAt = time.Now()

			// Check for triggers
			m.checkTriggers(position, oldPrice, price)
		}
	}
}

// GetOpenPositions returns all open positions
func (m *Monitor) GetOpenPositions() []*types.Position {
	m.mu.RLock()
	defer m.mu.RUnlock()

	positions := make([]*types.Position, 0, len(m.positions))
	for _, pos := range m.positions {
		// Create a copy
		posCopy := *pos
		positions = append(positions, &posCopy)
	}

	return positions
}

// GetPositionCount returns the number of open positions
func (m *Monitor) GetPositionCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return len(m.positions)
}

// GetPosition returns a position by ID
func (m *Monitor) GetPosition(positionID string) (*types.Position, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	pos, exists := m.positions[positionID]
	if !exists {
		return nil, false
	}

	// Return a copy
	posCopy := *pos
	return &posCopy, true
}

// loadOpenPositions loads open positions from storage
func (m *Monitor) loadOpenPositions() error {
	// Get all positions (we'll filter for open ones)
	// Note: In a real implementation, the storage interface should have
	// a GetOpenPositions() method for efficiency

	log.Info().Msg("Loading open positions from storage")

	// For now, we'll skip loading since we don't have a way to query all positions
	// This would be implemented once storage is fully connected

	return nil
}

// monitorLoop is the main monitoring loop
func (m *Monitor) monitorLoop() {
	defer m.wg.Done()

	ticker := time.NewTicker(monitorInterval)
	defer ticker.Stop()

	for {
		select {
		case <-m.ctx.Done():
			return

		case <-ticker.C:
			m.performMonitorCheck()
		}
	}
}

// performMonitorCheck performs a monitoring check on all positions
func (m *Monitor) performMonitorCheck() {
	m.mu.RLock()
	count := len(m.positions)
	m.mu.RUnlock()

	if count == 0 {
		return
	}

	log.Debug().Int("count", count).Msg("Performing monitor check")

	// Get current positions to check
	positions := m.GetOpenPositions()

	for _, position := range positions {
		// Check if position is still valid
		if position.Status != types.PositionStatusOpen {
			m.RemovePosition(position.ID)
			continue
		}

		// Update position in storage (to persist PnL changes)
		// Convert types.Position to storage.Position
		storagePos := convertToStoragePosition(position)
		if err := m.storage.UpdatePosition(context.Background(), storagePos); err != nil {
			log.Error().
				Err(err).
				Str("position_id", position.ID).
				Msg("Failed to update position in storage")
		}
	}
}

// checkTriggers checks if stop loss or take profit should be triggered
func (m *Monitor) checkTriggers(position *types.Position, oldPrice, newPrice float64) {
	if position.Status != types.PositionStatusOpen {
		return
	}

	isLong := position.Side == types.PositionSideLong

	// Check stop loss
	if helpers.ShouldTriggerStopLoss(newPrice, position.StopLoss, isLong) {
		// Only trigger if we crossed the threshold
		if !helpers.ShouldTriggerStopLoss(oldPrice, position.StopLoss, isLong) {
			log.Warn().
				Str("position_id", position.ID).
				Float64("price", newPrice).
				Float64("stop_loss", position.StopLoss).
				Msg("Stop loss triggered")

			m.triggerExit(position, "stop_loss", newPrice)
		}
		return
	}

	// Check take profit
	if helpers.ShouldTriggerTakeProfit(newPrice, position.TakeProfit, isLong) {
		// Only trigger if we crossed the threshold
		if !helpers.ShouldTriggerTakeProfit(oldPrice, position.TakeProfit, isLong) {
			log.Info().
				Str("position_id", position.ID).
				Float64("price", newPrice).
				Float64("take_profit", position.TakeProfit).
				Msg("Take profit triggered")

			m.triggerExit(position, "take_profit", newPrice)
		}
		return
	}
}

// triggerExit triggers an exit for a position
func (m *Monitor) triggerExit(position *types.Position, triggerType string, currentPrice float64) {
	if m.callback == nil {
		log.Warn().
			Str("position_id", position.ID).
			Str("trigger", triggerType).
			Msg("No callback configured, cannot trigger exit")
		return
	}

	// Execute callback in goroutine
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()

		if err := m.callback(position, triggerType, currentPrice); err != nil {
			log.Error().
				Err(err).
				Str("position_id", position.ID).
				Str("trigger", triggerType).
				Msg("Exit callback failed")
		}
	}()
}

// GetTotalPnL calculates total PnL across all open positions
func (m *Monitor) GetTotalPnL() float64 {
	m.mu.RLock()
	defer m.mu.RUnlock()

	total := 0.0
	for _, position := range m.positions {
		total += position.UnrealizedPnL
	}

	return total
}

// GetPositionsByUser returns open positions for a specific user
func (m *Monitor) GetPositionsByUser(userID string) []*types.Position {
	m.mu.RLock()
	defer m.mu.RUnlock()

	positions := make([]*types.Position, 0)
	for _, pos := range m.positions {
		if pos.UserID == userID {
			posCopy := *pos
			positions = append(positions, &posCopy)
		}
	}

	return positions
}

// GetPositionsBySymbol returns open positions for a specific symbol
func (m *Monitor) GetPositionsBySymbol(symbol string) []*types.Position {
	m.mu.RLock()
	defer m.mu.RUnlock()

	positions := make([]*types.Position, 0)
	for _, pos := range m.positions {
		if pos.Symbol == symbol {
			posCopy := *pos
			positions = append(positions, &posCopy)
		}
	}

	return positions
}

// convertToStoragePosition converts types.Position to storage.Position
func convertToStoragePosition(p *types.Position) *storage.Position {
	return &storage.Position{
		ID:           p.ID,
		UserID:       p.UserID,
		TraderID:     p.TraderID,
		SignalID:     p.SignalID,
		Symbol:       p.Symbol,
		Side:         string(p.Side),
		EntryPrice:   p.EntryPrice,
		CurrentPrice: p.CurrentPrice,
		Size:         p.Quantity,
		StopLoss:     p.StopLoss,
		TakeProfit:   p.TakeProfit,
		PNL:          p.UnrealizedPnL,
		PNLPct:       p.PnLPercent,
		Status:       string(p.Status),
		CreatedAt:    p.CreatedAt,
		UpdatedAt:    p.UpdatedAt,
		ClosedAt:     p.ClosedAt,
	}
}
