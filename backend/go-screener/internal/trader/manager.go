package trader

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/vyx/go-screener/pkg/config"
	"github.com/vyx/go-screener/pkg/supabase"
	"github.com/vyx/go-screener/pkg/types"
	"golang.org/x/sync/semaphore"
)

// Manager orchestrates trader lifecycle and execution
type Manager struct {
	config   *config.Config
	registry *Registry
	executor *Executor
	supabase *supabase.Client
	quotas   *QuotaManager

	// Goroutine pool management
	pool     *semaphore.Weighted // Limits concurrent traders
	poolSize int64               // Max concurrent traders

	// Lifecycle management
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup

	// Shutdown coordination
	shutdownOnce sync.Once
	shutdownErr  error
}

// NewManager creates a new trader manager
func NewManager(cfg *config.Config, executor *Executor, supabase *supabase.Client) *Manager {
	ctx, cancel := context.WithCancel(context.Background())

	// Default pool size: 1000 concurrent traders
	poolSize := int64(1000)

	registry := NewRegistry(nil) // Use default registry config
	quotas := NewQuotaManager(poolSize) // Global max = pool size

	return &Manager{
		config:   cfg,
		registry: registry,
		executor: executor,
		supabase: supabase,
		quotas:   quotas,
		pool:     semaphore.NewWeighted(poolSize),
		poolSize: poolSize,
		ctx:      ctx,
		cancel:   cancel,
	}
}

// Start starts a trader by ID with optional user tier for quota enforcement
func (m *Manager) Start(traderID string, userTier ...string) error {
	// Get trader from registry
	trader, exists := m.registry.Get(traderID)
	if !exists {
		return fmt.Errorf("trader %s not found in registry", traderID)
	}

	// Check if trader can be started
	if !trader.CanStart() {
		return fmt.Errorf("trader %s is in %s state and cannot be started", traderID, trader.GetState())
	}

	// Determine user tier (default to Pro if not provided)
	tier := "PRO"
	if len(userTier) > 0 {
		tier = userTier[0]
	}

	// Check quotas
	if err := m.quotas.Acquire(trader.UserID, types.SubscriptionTier(tier)); err != nil {
		return fmt.Errorf("quota check failed: %w", err)
	}

	// Acquire goroutine pool slot (non-blocking check)
	// Note: This is redundant with quota system but kept for backwards compatibility
	if !m.pool.TryAcquire(1) {
		m.quotas.Release(trader.UserID, types.SubscriptionTier(tier)) // Release quota
		return fmt.Errorf("goroutine pool is full (max %d traders), cannot start trader", m.poolSize)
	}

	// Transition to starting state
	if err := trader.TransitionTo(StateStarting); err != nil {
		m.pool.Release(1) // Release pool slot on error
		m.quotas.Release(trader.UserID, types.SubscriptionTier(tier)) // Release quota
		return fmt.Errorf("failed to transition to starting state: %w", err)
	}

	// Start executor in goroutine
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()
		defer m.pool.Release(1) // Release pool slot when done
		defer m.quotas.Release(trader.UserID, types.SubscriptionTier(tier)) // Release quota when done

		// Create trader-specific context
		traderCtx, traderCancel := context.WithCancel(m.ctx)
		defer traderCancel()

		// Start executor
		if err := m.executor.Start(traderCtx, trader); err != nil {
			log.Printf("[Manager] Failed to start trader %s: %v", traderID, err)
			_ = trader.SetError(err)
			return
		}

		// Transition to running state
		if err := trader.TransitionTo(StateRunning); err != nil {
			log.Printf("[Manager] Failed to transition trader %s to running: %v", traderID, err)
			_ = trader.SetError(err)
			return
		}

		log.Printf("[Manager] Trader %s started successfully", traderID)

		// Wait for context cancellation or error
		<-traderCtx.Done()

		// Transition to stopping
		_ = trader.TransitionTo(StateStopping)

		// Transition to stopped
		_ = trader.TransitionTo(StateStopped)

		log.Printf("[Manager] Trader %s stopped", traderID)
	}()

	return nil
}

// Stop stops a trader by ID
func (m *Manager) Stop(traderID string) error {
	// Get trader from registry
	trader, exists := m.registry.Get(traderID)
	if !exists {
		return fmt.Errorf("trader %s not found in registry", traderID)
	}

	// Check if trader can be stopped
	if !trader.CanStop() {
		return fmt.Errorf("trader %s is in %s state and cannot be stopped", traderID, trader.GetState())
	}

	// Cancel trader's context
	trader.Cancel()

	// Transition to stopping state
	if err := trader.TransitionTo(StateStopping); err != nil {
		return fmt.Errorf("failed to transition to stopping state: %w", err)
	}

	log.Printf("[Manager] Stopping trader %s", traderID)

	return nil
}

// StopAll stops all running traders
func (m *Manager) StopAll() error {
	traders := m.registry.GetByState(StateRunning)
	if len(traders) == 0 {
		log.Printf("[Manager] No running traders to stop")
		return nil
	}

	log.Printf("[Manager] Stopping %d traders", len(traders))

	var errors []error
	for _, trader := range traders {
		if err := m.Stop(trader.ID); err != nil {
			errors = append(errors, err)
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("errors stopping traders: %v", errors)
	}

	return nil
}

// GetStatus returns the status of a trader
func (m *Manager) GetStatus(traderID string) (*TraderStatus, error) {
	trader, exists := m.registry.Get(traderID)
	if !exists {
		return nil, fmt.Errorf("trader %s not found", traderID)
	}

	status := trader.GetStatus()
	return &status, nil
}

// ListActive returns all active traders (running or starting)
func (m *Manager) ListActive() []*Trader {
	running := m.registry.GetByState(StateRunning)
	starting := m.registry.GetByState(StateStarting)

	active := make([]*Trader, 0, len(running)+len(starting))
	active = append(active, running...)
	active = append(active, starting...)

	return active
}

// ListByUser returns all traders for a specific user
func (m *Manager) ListByUser(userID string) []*Trader {
	return m.registry.GetByUser(userID)
}

// GetMetrics returns manager metrics
func (m *Manager) GetMetrics() map[string]interface{} {
	registryMetrics := m.registry.GetMetrics()
	quotaMetrics := m.quotas.GetMetrics()

	// Count active traders as pool usage
	activeCount := int64(len(m.ListActive()))

	// Update Prometheus pool metrics
	UpdatePoolMetrics(float64(m.poolSize), float64(activeCount))

	metrics := map[string]interface{}{
		"registry":  registryMetrics,
		"quotas":    quotaMetrics,
		"pool_size": m.poolSize,
		"pool_used": activeCount,
	}

	return metrics
}

// LoadTradersFromDB loads traders from the database and registers them
// This is called on server startup to restore trader state
func (m *Manager) LoadTradersFromDB() error {
	log.Printf("[Manager] Loading traders from database")

	// For now, we'll just log - actual implementation would:
	// 1. Query supabase for all traders that should be running
	// 2. Create Trader instances from database records
	// 3. Register them in the registry
	// 4. Optionally auto-start them based on preferences

	// TODO: Implement database loading
	// This requires querying the traders table and trader_state table

	log.Printf("[Manager] Loaded 0 traders from database (not yet implemented)")
	return nil
}

// RegisterTrader registers a trader in the manager
// This is used when a trader is created via the API
func (m *Manager) RegisterTrader(trader *Trader) error {
	if err := m.registry.Register(trader); err != nil {
		return fmt.Errorf("failed to register trader: %w", err)
	}

	log.Printf("[Manager] Registered trader %s (user: %s)", trader.ID, trader.UserID)
	return nil
}

// UnregisterTrader removes a trader from the manager
func (m *Manager) UnregisterTrader(traderID string) error {
	// Stop trader if running
	trader, exists := m.registry.Get(traderID)
	if exists && trader.IsRunning() {
		if err := m.Stop(traderID); err != nil {
			log.Printf("[Manager] Failed to stop trader %s during unregister: %v", traderID, err)
		}
	}

	if err := m.registry.Unregister(traderID); err != nil {
		return fmt.Errorf("failed to unregister trader: %w", err)
	}

	log.Printf("[Manager] Unregistered trader %s", traderID)
	return nil
}

// Shutdown gracefully shuts down the manager
// Stops all traders and waits for them to complete with a timeout
func (m *Manager) Shutdown(timeout time.Duration) error {
	m.shutdownOnce.Do(func() {
		log.Printf("[Manager] Shutting down (timeout: %v)", timeout)

		// Stop all traders
		if err := m.StopAll(); err != nil {
			log.Printf("[Manager] Error stopping traders: %v", err)
		}

		// Cancel global context
		m.cancel()

		// Wait for all goroutines to finish with timeout
		done := make(chan struct{})
		go func() {
			m.wg.Wait()
			close(done)
		}()

		select {
		case <-done:
			log.Printf("[Manager] All traders stopped gracefully")
			m.shutdownErr = nil
		case <-time.After(timeout):
			log.Printf("[Manager] Shutdown timeout reached, some traders may still be running")
			m.shutdownErr = fmt.Errorf("shutdown timeout after %v", timeout)
		}

		// Stop registry cleanup goroutine
		m.registry.Stop()
	})

	return m.shutdownErr
}

// HealthCheck returns health status of the manager
func (m *Manager) HealthCheck() map[string]interface{} {
	metrics := m.GetMetrics()

	return map[string]interface{}{
		"status":  "healthy",
		"metrics": metrics,
	}
}
