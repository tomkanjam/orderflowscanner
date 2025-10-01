package timer

import (
	"context"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/yourusername/aitrader-tui/internal/helpers"
	"github.com/yourusername/aitrader-tui/internal/types"
)

// CheckCallback is called when a timer fires
type CheckCallback func(traderID string) error

// Manager manages periodic timer checks for traders
type Manager struct {
	mu       sync.RWMutex
	ctx      context.Context
	cancel   context.CancelFunc
	wg       sync.WaitGroup

	// Timers for each trader
	timers   map[string]*time.Timer // traderID -> timer
	checks   map[string]*types.TimerCheck // traderID -> check config

	// Callback for when timer fires
	callback CheckCallback

	// State
	running  bool
}

// NewManager creates a new timer manager
func NewManager(callback CheckCallback) *Manager {
	ctx, cancel := context.WithCancel(context.Background())

	return &Manager{
		ctx:      ctx,
		cancel:   cancel,
		timers:   make(map[string]*time.Timer),
		checks:   make(map[string]*types.TimerCheck),
		callback: callback,
		running:  false,
	}
}

// Start starts the timer manager
func (m *Manager) Start() error {
	m.mu.Lock()
	if m.running {
		m.mu.Unlock()
		return nil
	}
	m.running = true
	m.mu.Unlock()

	log.Info().Msg("Timer manager started")

	return nil
}

// Stop stops the timer manager
func (m *Manager) Stop() error {
	m.mu.Lock()
	if !m.running {
		m.mu.Unlock()
		return nil
	}
	m.running = false
	m.mu.Unlock()

	log.Info().Msg("Stopping timer manager")

	// Cancel context
	m.cancel()

	// Stop all timers
	m.mu.Lock()
	for _, timer := range m.timers {
		timer.Stop()
	}
	m.mu.Unlock()

	// Wait for goroutines
	m.wg.Wait()

	log.Info().Msg("Timer manager stopped")

	return nil
}

// ScheduleTrader schedules periodic checks for a trader
func (m *Manager) ScheduleTrader(trader *types.Trader) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.running {
		return nil
	}

	// Stop existing timer if any
	if timer, exists := m.timers[trader.ID]; exists {
		timer.Stop()
	}

	// Create check config
	check := &types.TimerCheck{
		TraderID:      trader.ID,
		NextCheckTime: helpers.CalculateNextCheckTime(trader.CheckIntervalSec),
		IntervalSec:   trader.CheckIntervalSec,
	}

	// Calculate initial delay
	delay := time.Until(check.NextCheckTime)
	if delay < 0 {
		delay = 0
	}

	// Create timer
	timer := time.AfterFunc(delay, func() {
		m.handleTimerFired(trader.ID)
	})

	// Store
	m.timers[trader.ID] = timer
	m.checks[trader.ID] = check

	log.Info().
		Str("trader_id", trader.ID).
		Int("interval_sec", trader.CheckIntervalSec).
		Time("next_check", check.NextCheckTime).
		Msg("Scheduled trader")

	return nil
}

// UnscheduleTrader removes a trader from the schedule
func (m *Manager) UnscheduleTrader(traderID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Stop timer
	if timer, exists := m.timers[traderID]; exists {
		timer.Stop()
		delete(m.timers, traderID)
	}

	// Remove check
	delete(m.checks, traderID)

	log.Info().Str("trader_id", traderID).Msg("Unscheduled trader")

	return nil
}

// RescheduleTrader updates a trader's schedule
func (m *Manager) RescheduleTrader(trader *types.Trader) error {
	// Remove old schedule
	if err := m.UnscheduleTrader(trader.ID); err != nil {
		return err
	}

	// Add new schedule
	return m.ScheduleTrader(trader)
}

// GetNextCheckTime returns the next check time for a trader
func (m *Manager) GetNextCheckTime(traderID string) (time.Time, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	check, exists := m.checks[traderID]
	if !exists {
		return time.Time{}, false
	}

	return check.NextCheckTime, true
}

// GetAllScheduled returns all scheduled trader IDs
func (m *Manager) GetAllScheduled() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	traders := make([]string, 0, len(m.checks))
	for traderID := range m.checks {
		traders = append(traders, traderID)
	}

	return traders
}

// GetScheduledCount returns the number of scheduled traders
func (m *Manager) GetScheduledCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return len(m.checks)
}

// handleTimerFired is called when a timer fires
func (m *Manager) handleTimerFired(traderID string) {
	// Check if manager is still running
	m.mu.RLock()
	running := m.running
	check, exists := m.checks[traderID]
	m.mu.RUnlock()

	if !running {
		return
	}

	if !exists {
		log.Warn().Str("trader_id", traderID).Msg("Timer fired but no check config found")
		return
	}

	log.Debug().Str("trader_id", traderID).Msg("Timer fired")

	// Execute callback
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()

		if m.callback != nil {
			if err := m.callback(traderID); err != nil {
				log.Error().
					Err(err).
					Str("trader_id", traderID).
					Msg("Timer callback failed")
			}
		}
	}()

	// Reschedule next check
	m.mu.Lock()
	defer m.mu.Unlock()

	// Update next check time
	check.NextCheckTime = helpers.CalculateNextCheckTime(check.IntervalSec)

	// Calculate delay for next check
	delay := time.Until(check.NextCheckTime)
	if delay < 0 {
		delay = time.Second // Minimum 1 second delay
	}

	// Create new timer
	timer := time.AfterFunc(delay, func() {
		m.handleTimerFired(traderID)
	})

	// Replace old timer
	m.timers[traderID] = timer

	log.Debug().
		Str("trader_id", traderID).
		Time("next_check", check.NextCheckTime).
		Msg("Rescheduled timer")
}

// TriggerNow immediately triggers a check for a trader
func (m *Manager) TriggerNow(traderID string) error {
	m.mu.RLock()
	_, exists := m.checks[traderID]
	m.mu.RUnlock()

	if !exists {
		return nil
	}

	log.Info().Str("trader_id", traderID).Msg("Triggering immediate check")

	// Execute callback
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()

		if m.callback != nil {
			if err := m.callback(traderID); err != nil {
				log.Error().
					Err(err).
					Str("trader_id", traderID).
					Msg("Immediate check failed")
			}
		}
	}()

	return nil
}
