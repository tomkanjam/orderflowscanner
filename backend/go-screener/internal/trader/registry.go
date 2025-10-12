package trader

import (
	"fmt"
	"sync"
	"time"
)

// RegistryMetrics tracks registry statistics
type RegistryMetrics struct {
	TotalRegistered   int64 // Total traders registered (lifetime counter)
	TotalUnregistered int64 // Total traders unregistered (lifetime counter)
	ActiveCount       int64 // Currently active traders
	ByState           map[TraderState]int64 // Count by state
	mu                sync.RWMutex
}

// NewRegistryMetrics creates a new metrics instance
func NewRegistryMetrics() *RegistryMetrics {
	return &RegistryMetrics{
		ByState: make(map[TraderState]int64),
	}
}

// IncrementRegistered increments the registered counter
func (m *RegistryMetrics) IncrementRegistered() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.TotalRegistered++
	m.ActiveCount++
}

// IncrementUnregistered increments the unregistered counter
func (m *RegistryMetrics) IncrementUnregistered() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.TotalUnregistered++
	m.ActiveCount--
}

// UpdateStateCount updates the count for a specific state
func (m *RegistryMetrics) UpdateStateCount(state TraderState, delta int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.ByState[state] += delta
}

// GetMetrics returns a copy of current metrics (thread-safe)
func (m *RegistryMetrics) GetMetrics() map[string]interface{} {
	m.mu.RLock()
	defer m.mu.RUnlock()

	byState := make(map[string]int64)
	for state, count := range m.ByState {
		byState[string(state)] = count
	}

	return map[string]interface{}{
		"total_registered":   m.TotalRegistered,
		"total_unregistered": m.TotalUnregistered,
		"active_count":       m.ActiveCount,
		"by_state":           byState,
	}
}

// Registry manages a collection of active traders
type Registry struct {
	traders sync.Map // map[string]*Trader (trader ID -> Trader)
	metrics *RegistryMetrics

	// Auto-cleanup configuration
	cleanupInterval time.Duration // How often to run cleanup
	cleanupDelay    time.Duration // How long to wait before removing stopped traders
	stopCleanup     chan struct{} // Signal to stop cleanup goroutine
	cleanupWg       sync.WaitGroup

	mu sync.RWMutex // For operations that need iteration
}

// RegistryConfig holds configuration for the registry
type RegistryConfig struct {
	CleanupInterval time.Duration // How often to run cleanup (default: 1 minute)
	CleanupDelay    time.Duration // How long to wait before removing stopped traders (default: 5 minutes)
}

// DefaultRegistryConfig returns default configuration
func DefaultRegistryConfig() *RegistryConfig {
	return &RegistryConfig{
		CleanupInterval: 1 * time.Minute,
		CleanupDelay:    5 * time.Minute,
	}
}

// NewRegistry creates a new trader registry
func NewRegistry(config *RegistryConfig) *Registry {
	if config == nil {
		config = DefaultRegistryConfig()
	}

	r := &Registry{
		metrics:         NewRegistryMetrics(),
		cleanupInterval: config.CleanupInterval,
		cleanupDelay:    config.CleanupDelay,
		stopCleanup:     make(chan struct{}),
	}

	// Start auto-cleanup goroutine
	r.startCleanup()

	return r
}

// Register adds a trader to the registry
func (r *Registry) Register(trader *Trader) error {
	if trader == nil {
		return fmt.Errorf("cannot register nil trader")
	}

	if trader.ID == "" {
		return fmt.Errorf("trader ID cannot be empty")
	}

	// Check if already registered
	if _, exists := r.traders.Load(trader.ID); exists {
		return fmt.Errorf("trader %s is already registered", trader.ID)
	}

	// Store trader
	r.traders.Store(trader.ID, trader)

	// Update metrics
	r.metrics.IncrementRegistered()
	r.metrics.UpdateStateCount(trader.GetState(), 1)

	return nil
}

// Unregister removes a trader from the registry
func (r *Registry) Unregister(id string) error {
	if id == "" {
		return fmt.Errorf("trader ID cannot be empty")
	}

	// Load and delete atomically
	value, loaded := r.traders.LoadAndDelete(id)
	if !loaded {
		return fmt.Errorf("trader %s not found", id)
	}

	trader := value.(*Trader)

	// Update metrics
	r.metrics.IncrementUnregistered()
	r.metrics.UpdateStateCount(trader.GetState(), -1)

	return nil
}

// Get retrieves a trader by ID
func (r *Registry) Get(id string) (*Trader, bool) {
	value, ok := r.traders.Load(id)
	if !ok {
		return nil, false
	}
	return value.(*Trader), true
}

// Exists checks if a trader is registered
func (r *Registry) Exists(id string) bool {
	_, ok := r.traders.Load(id)
	return ok
}

// List returns all registered traders
func (r *Registry) List() []*Trader {
	var traders []*Trader

	r.traders.Range(func(key, value interface{}) bool {
		trader := value.(*Trader)
		traders = append(traders, trader)
		return true
	})

	return traders
}

// GetByUser returns all traders for a specific user
func (r *Registry) GetByUser(userID string) []*Trader {
	var traders []*Trader

	r.traders.Range(func(key, value interface{}) bool {
		trader := value.(*Trader)
		if trader.UserID == userID {
			traders = append(traders, trader)
		}
		return true
	})

	return traders
}

// GetByState returns all traders in a specific state
func (r *Registry) GetByState(state TraderState) []*Trader {
	var traders []*Trader

	r.traders.Range(func(key, value interface{}) bool {
		trader := value.(*Trader)
		if trader.GetState() == state {
			traders = append(traders, trader)
		}
		return true
	})

	return traders
}

// Count returns the total number of registered traders
func (r *Registry) Count() int {
	count := 0
	r.traders.Range(func(key, value interface{}) bool {
		count++
		return true
	})
	return count
}

// CountByUser returns the number of traders for a specific user
func (r *Registry) CountByUser(userID string) int {
	count := 0
	r.traders.Range(func(key, value interface{}) bool {
		trader := value.(*Trader)
		if trader.UserID == userID {
			count++
		}
		return true
	})
	return count
}

// GetMetrics returns current registry metrics
func (r *Registry) GetMetrics() map[string]interface{} {
	// Recalculate state counts (in case states changed)
	stateCounts := make(map[TraderState]int64)
	r.traders.Range(func(key, value interface{}) bool {
		trader := value.(*Trader)
		stateCounts[trader.GetState()]++
		return true
	})

	// Update metrics with current state counts
	for state := range stateCounts {
		r.metrics.UpdateStateCount(state, stateCounts[state])
	}

	return r.metrics.GetMetrics()
}

// startCleanup starts the auto-cleanup goroutine
func (r *Registry) startCleanup() {
	r.cleanupWg.Add(1)
	go r.cleanupLoop()
}

// cleanupLoop runs periodic cleanup of stopped traders
func (r *Registry) cleanupLoop() {
	defer r.cleanupWg.Done()

	ticker := time.NewTicker(r.cleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			r.cleanup()
		case <-r.stopCleanup:
			return
		}
	}
}

// cleanup removes stopped traders that have been stopped for longer than cleanupDelay
func (r *Registry) cleanup() {
	now := time.Now()
	var toRemove []string

	r.traders.Range(func(key, value interface{}) bool {
		trader := value.(*Trader)
		traderID := key.(string)

		// Only cleanup stopped or error traders
		if trader.IsStopped() {
			trader.mu.RLock()
			stoppedAt := trader.stoppedAt
			trader.mu.RUnlock()

			// If stopped long enough ago, mark for removal
			if !stoppedAt.IsZero() && now.Sub(stoppedAt) > r.cleanupDelay {
				toRemove = append(toRemove, traderID)
			}
		}

		return true
	})

	// Remove marked traders
	for _, id := range toRemove {
		_ = r.Unregister(id) // Ignore errors (trader might have been removed already)
	}

	if len(toRemove) > 0 {
		// Log cleanup (in production, use structured logger)
		// fmt.Printf("[Registry] Cleaned up %d stopped traders\n", len(toRemove))
	}
}

// Stop stops the registry and cleanup goroutine
func (r *Registry) Stop() {
	close(r.stopCleanup)
	r.cleanupWg.Wait()
}

// Clear removes all traders from the registry (for testing)
func (r *Registry) Clear() {
	r.traders.Range(func(key, value interface{}) bool {
		r.traders.Delete(key)
		return true
	})

	// Reset metrics
	r.metrics = NewRegistryMetrics()
}
