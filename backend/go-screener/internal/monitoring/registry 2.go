package monitoring

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"
)

// Registry manages active monitoring states in memory
type Registry struct {
	monitors map[string]*MonitoringState // signalID -> state
	mu       sync.RWMutex
}

// NewRegistry creates a new monitoring state registry
func NewRegistry() *Registry {
	return &Registry{
		monitors: make(map[string]*MonitoringState),
	}
}

// Add adds a new monitor to the registry
func (r *Registry) Add(monitor *MonitoringState) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if monitor.SignalID == "" {
		return fmt.Errorf("signal_id is required")
	}

	// Set defaults if not provided
	if monitor.MonitoringStarted.IsZero() {
		monitor.MonitoringStarted = time.Now()
	}
	if monitor.LastReanalysisAt.IsZero() {
		monitor.LastReanalysisAt = time.Now()
	}
	if monitor.CreatedAt.IsZero() {
		monitor.CreatedAt = time.Now()
	}
	monitor.UpdatedAt = time.Now()
	monitor.IsActive = true

	r.monitors[monitor.SignalID] = monitor
	log.Printf("[Registry] Added monitor for signal %s (%s/%s)",
		monitor.SignalID, monitor.Symbol, monitor.Interval)

	return nil
}

// Get retrieves a monitor by signal ID
func (r *Registry) Get(signalID string) (*MonitoringState, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	monitor, ok := r.monitors[signalID]
	return monitor, ok
}

// GetActive returns all active monitors
func (r *Registry) GetActive() []*MonitoringState {
	r.mu.RLock()
	defer r.mu.RUnlock()

	active := make([]*MonitoringState, 0, len(r.monitors))
	for _, monitor := range r.monitors {
		if monitor.IsActive {
			active = append(active, monitor)
		}
	}

	return active
}

// GetBySymbolInterval returns all active monitors for a symbol+interval
func (r *Registry) GetBySymbolInterval(symbol, interval string) []*MonitoringState {
	r.mu.RLock()
	defer r.mu.RUnlock()

	matches := make([]*MonitoringState, 0)
	for _, monitor := range r.monitors {
		if monitor.IsActive && monitor.Symbol == symbol && monitor.Interval == interval {
			matches = append(matches, monitor)
		}
	}

	return matches
}

// Update updates a monitor's state
func (r *Registry) Update(monitor *MonitoringState) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.monitors[monitor.SignalID]; !ok {
		return fmt.Errorf("monitor not found: %s", monitor.SignalID)
	}

	monitor.UpdatedAt = time.Now()
	r.monitors[monitor.SignalID] = monitor

	return nil
}

// Deactivate marks a monitor as inactive (expired or completed)
func (r *Registry) Deactivate(signalID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	monitor, ok := r.monitors[signalID]
	if !ok {
		return fmt.Errorf("monitor not found: %s", signalID)
	}

	monitor.IsActive = false
	monitor.UpdatedAt = time.Now()
	r.monitors[signalID] = monitor

	log.Printf("[Registry] Deactivated monitor for signal %s", signalID)

	return nil
}

// Remove completely removes a monitor from the registry
func (r *Registry) Remove(signalID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.monitors, signalID)
	log.Printf("[Registry] Removed monitor for signal %s", signalID)
}

// Count returns the total number of monitors (active and inactive)
func (r *Registry) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return len(r.monitors)
}

// CountActive returns the number of active monitors
func (r *Registry) CountActive() int {
	r.mu.RLock()
	defer r.mu.RUnlock()

	count := 0
	for _, monitor := range r.monitors {
		if monitor.IsActive {
			count++
		}
	}

	return count
}

// Clear removes all monitors (for testing)
func (r *Registry) Clear() {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.monitors = make(map[string]*MonitoringState)
	log.Printf("[Registry] Cleared all monitors")
}

// Cleanup removes inactive monitors older than the specified duration
func (r *Registry) Cleanup(ctx context.Context, olderThan time.Duration) int {
	r.mu.Lock()
	defer r.mu.Unlock()

	removed := 0
	cutoff := time.Now().Add(-olderThan)

	for signalID, monitor := range r.monitors {
		if !monitor.IsActive && monitor.UpdatedAt.Before(cutoff) {
			delete(r.monitors, signalID)
			removed++
		}
	}

	if removed > 0 {
		log.Printf("[Registry] Cleaned up %d inactive monitors", removed)
	}

	return removed
}
