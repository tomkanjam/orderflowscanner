package trader

import (
	"context"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"github.com/vyx/go-screener/pkg/config"
	"github.com/vyx/go-screener/pkg/supabase"
	"github.com/vyx/go-screener/pkg/types"
	"github.com/vyx/go-screener/pkg/yaegi"
	"golang.org/x/sync/semaphore"
)

// Manager orchestrates trader lifecycle and execution
type Manager struct {
	config   *config.Config
	registry *Registry
	executor *Executor
	supabase *supabase.Client
	quotas   *QuotaManager
	yaegi    *yaegi.Executor

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
func NewManager(cfg *config.Config, executor *Executor, supabase *supabase.Client, yaegi *yaegi.Executor) *Manager {
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
		yaegi:    yaegi,
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

	// Add trader to executor (event-driven execution)
	if err := m.executor.AddTrader(trader); err != nil {
		m.pool.Release(1) // Release pool slot on error
		m.quotas.Release(trader.UserID, types.SubscriptionTier(tier)) // Release quota on error
		return fmt.Errorf("failed to add trader to executor: %w", err)
	}

	// Transition to running state
	if err := trader.TransitionTo(StateRunning); err != nil {
		m.executor.RemoveTrader(traderID) // Remove from executor on error
		m.pool.Release(1) // Release pool slot on error
		m.quotas.Release(trader.UserID, types.SubscriptionTier(tier)) // Release quota on error
		return fmt.Errorf("failed to transition to running state: %w", err)
	}

	log.Printf("[Manager] Trader %s started successfully (event-driven)", traderID)

	// NOTE: With event-driven executor, we don't need a goroutine per trader
	// The executor manages all traders and triggers them on candle events
	// We still track pool/quota slots but release them when trader is stopped

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

	// Transition to stopping state
	if err := trader.TransitionTo(StateStopping); err != nil {
		return fmt.Errorf("failed to transition to stopping state: %w", err)
	}

	// Remove from executor (event-driven execution)
	m.executor.RemoveTrader(traderID)

	// Release pool slot and quota
	m.pool.Release(1)

	// Get user tier from trader or use default
	// TODO: Store tier in trader for accurate quota release
	tier := types.SubscriptionTier("PRO") // Default assumption
	m.quotas.Release(trader.UserID, tier)

	// Transition to stopped state
	if err := trader.TransitionTo(StateStopped); err != nil {
		log.Printf("[Manager] Failed to transition trader %s to stopped: %v", traderID, err)
	}

	log.Printf("[Manager] Stopped trader %s", traderID)

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

// ExecuteImmediate executes a trader immediately using cached data
// Returns execution results without waiting for next candle close event
func (m *Manager) ExecuteImmediate(traderID string) (*ExecutionResult, error) {
	// Get trader from registry
	trader, exists := m.registry.Get(traderID)
	if !exists {
		return nil, fmt.Errorf("trader %s not found in registry", traderID)
	}

	// Ensure trader is added to executor
	// This loads the trader if it's not already loaded
	if err := m.executor.AddTrader(trader); err != nil {
		return nil, fmt.Errorf("failed to add trader to executor: %w", err)
	}

	// Execute immediately via executor
	result, err := m.executor.ExecuteImmediate(traderID)
	if err != nil {
		return nil, fmt.Errorf("immediate execution failed: %w", err)
	}

	return result, nil
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

// GetRegistry returns the trader registry
func (m *Manager) GetRegistry() *Registry {
	return m.registry
}

// LoadTradersFromDB loads traders from the database and registers them
// This is called on server startup to restore trader state
func (m *Manager) LoadTradersFromDB() error {
	startTime := time.Now()
	log.Printf("[Manager] Loading traders from database")

	// Track success/failure counts
	loaded := 0
	failed := 0

	// Determine run mode and fetch appropriate traders
	runMode := os.Getenv("RUN_MODE")
	if runMode == "" {
		runMode = "shared_backend" // Default to shared mode
	}

	var allTraders []types.Trader
	var err error

	if runMode == "user_dedicated" {
		// User-dedicated mode: Load only this user's traders (exclude built-in)
		userID := os.Getenv("USER_ID")
		if userID == "" {
			log.Printf("[Manager] ERROR: USER_ID required for user_dedicated mode")
			return fmt.Errorf("USER_ID required for user_dedicated mode")
		}

		log.Printf("[Manager] Loading traders for user: %s (user_dedicated mode)", userID)
		allTraders, err = m.supabase.GetTraders(m.ctx, userID)
		if err != nil {
			log.Printf("[Manager] Failed to fetch user traders: %v", err)
			TradersLoadDuration.Observe(time.Since(startTime).Seconds())
			return nil // Don't fail server startup, just log
		}

		// Filter out built-in traders (user-dedicated instances should not run built-in)
		var userTraders []types.Trader
		for _, trader := range allTraders {
			if !trader.IsBuiltIn && trader.Enabled {
				userTraders = append(userTraders, trader)
			}
		}
		allTraders = userTraders
	} else {
		// Shared backend mode: Load only built-in traders
		log.Printf("[Manager] Loading built-in traders (shared_backend mode)")
		allTraders, err = m.supabase.GetBuiltInTraders(m.ctx)
		if err != nil {
			log.Printf("[Manager] Failed to fetch built-in traders: %v", err)
			TradersLoadDuration.Observe(time.Since(startTime).Seconds())
			return nil // Don't fail server startup, just log
		}
	}

	log.Printf("[Manager] Found %d traders to load in %s mode", len(allTraders), runMode)

	// Convert and register each trader
	for _, dbTrader := range allTraders {
		// Convert database model to runtime model
		trader, err := convertDBTraderToRuntime(&dbTrader)
		if err != nil {
			log.Printf("[Manager] Failed to convert trader %s (%s): %v",
				dbTrader.ID, dbTrader.Name, err)
			failed++
			TradersLoadedFromDB.WithLabelValues("failed").Inc()
			continue // Skip this trader, continue with others
		}

		// Validate filter code syntax (lightweight check)
		if err := m.yaegi.ValidateCode(trader.Config.FilterCode); err != nil {
			log.Printf("[Manager] Skipping trader %s (%s): invalid filter code: %v",
				trader.ID, trader.Name, err)
			failed++
			TradersLoadedFromDB.WithLabelValues("failed").Inc()
			continue // Skip this trader
		}

		// Register trader in registry
		if err := m.RegisterTrader(trader); err != nil {
			log.Printf("[Manager] Failed to register trader %s (%s): %v",
				trader.ID, trader.Name, err)
			failed++
			TradersLoadedFromDB.WithLabelValues("failed").Inc()
			continue
		}

		// Add trader to executor for event-driven execution
		if err := m.executor.AddTrader(trader); err != nil {
			log.Printf("[Manager] Failed to add trader %s (%s) to executor: %v",
				trader.ID, trader.Name, err)
			// Don't fail - trader is registered, just won't execute
		}

		loaded++
		TradersLoadedFromDB.WithLabelValues("success").Inc()
		log.Printf("[Manager] ✅ Loaded trader: %s (%s)", trader.ID, trader.Name)
	}

	// Record load duration
	duration := time.Since(startTime)
	TradersLoadDuration.Observe(duration.Seconds())

	// Log summary
	log.Printf("[Manager] Loaded %d traders from database (%d failed) in %v",
		loaded, failed, duration)

	return nil // Always return success (graceful degradation)
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

// LoadTraderByID loads a single trader from the database by ID and adds it to the executor
// This is used to hot-reload newly created traders without server restart
func (m *Manager) LoadTraderByID(traderID string) error {
	log.Printf("[Manager] Loading trader %s from database", traderID)

	// Fetch trader from database
	dbTrader, err := m.supabase.GetTrader(m.ctx, traderID)
	if err != nil {
		return fmt.Errorf("failed to fetch trader: %w", err)
	}

	// Check if enabled
	if !dbTrader.Enabled {
		return fmt.Errorf("trader %s is not enabled", traderID)
	}

	// Convert database model to runtime model
	trader, err := convertDBTraderToRuntime(dbTrader)
	if err != nil {
		return fmt.Errorf("failed to convert trader: %w", err)
	}

	// Validate filter code
	if err := m.yaegi.ValidateCode(trader.Config.FilterCode); err != nil {
		return fmt.Errorf("invalid filter code: %w", err)
	}

	// Register trader in registry
	if err := m.RegisterTrader(trader); err != nil {
		return fmt.Errorf("failed to register trader: %w", err)
	}

	// Add trader to executor for event-driven execution
	if err := m.executor.AddTrader(trader); err != nil {
		return fmt.Errorf("failed to add trader to executor: %w", err)
	}

	log.Printf("[Manager] ✅ Loaded trader: %s (%s)", trader.ID, trader.Name)
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

// StartPolling starts background polling for trader changes (deletions)
// This detects when traders are deleted from the database and stops them
func (m *Manager) StartPolling(interval time.Duration) {
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()

		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		log.Printf("[Manager] Started polling for trader changes (interval: %v)", interval)

		for {
			select {
			case <-m.ctx.Done():
				log.Printf("[Manager] Polling stopped (context cancelled)")
				return
			case <-ticker.C:
				m.pollForChanges()
			}
		}
	}()
}

// pollForChanges polls the database for trader changes and handles deletions AND additions
func (m *Manager) pollForChanges() {
	// Get all enabled traders from database (built-in + user)
	allTraders, err := m.supabase.GetAllTraders(m.ctx)
	if err != nil {
		log.Printf("[Manager] Poll error: %v", err)
		return
	}

	// Build set of database trader IDs
	dbTraderIDs := make(map[string]bool)
	for _, t := range allTraders {
		dbTraderIDs[t.ID] = true
	}

	// Get all registered trader IDs
	registeredTraderIDs := make(map[string]bool)
	allRegistered := m.registry.List()
	for _, trader := range allRegistered {
		registeredTraderIDs[trader.ID] = true
	}

	// Check for NEW traders (in database but not registered)
	loaded := 0
	for _, dbTrader := range allTraders {
		if !registeredTraderIDs[dbTrader.ID] {
			log.Printf("[Manager] ➕ Detected new trader: %s (%s), loading...", dbTrader.ID, dbTrader.Name)

			// Convert and load the trader
			trader, err := convertDBTraderToRuntime(&dbTrader)
			if err != nil {
				log.Printf("[Manager] ⚠️  Failed to convert new trader %s: %v", dbTrader.ID, err)
				continue
			}

			// Validate filter code
			if err := m.yaegi.ValidateCode(trader.Config.FilterCode); err != nil {
				log.Printf("[Manager] ⚠️  Invalid filter code for new trader %s: %v", dbTrader.ID, err)
				continue
			}

			// Register trader
			if err := m.RegisterTrader(trader); err != nil {
				log.Printf("[Manager] ⚠️  Failed to register new trader %s: %v", dbTrader.ID, err)
				continue
			}

			// Add to executor
			if err := m.executor.AddTrader(trader); err != nil {
				log.Printf("[Manager] ⚠️  Failed to add new trader %s to executor: %v", dbTrader.ID, err)
				continue
			}

			log.Printf("[Manager] ✅ Loaded new trader: %s (%s)", trader.ID, trader.Name)
			loaded++
		}
	}

	// Check for DELETIONS (running traders not in database)
	runningTraders := m.registry.GetByState(StateRunning)
	stopped := 0

	for _, trader := range runningTraders {
		if !dbTraderIDs[trader.ID] {
			log.Printf("[Manager] 🗑️  Detected deleted trader: %s (%s), stopping...", trader.ID, trader.Name)

			if err := m.Stop(trader.ID); err != nil {
				log.Printf("[Manager] ⚠️  Failed to stop deleted trader %s: %v", trader.ID, err)
			} else {
				log.Printf("[Manager] ✅ Stopped deleted trader: %s", trader.ID)
				stopped++
			}
		}
	}

	// Log poll summary if any changes were detected
	if loaded > 0 || stopped > 0 {
		log.Printf("[Manager] Poll complete: loaded %d new trader(s), stopped %d deleted trader(s)", loaded, stopped)
	}
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

// convertDBTraderToRuntime converts a database Trader to a runtime Trader instance
func convertDBTraderToRuntime(dbTrader *types.Trader) (*Trader, error) {
	if dbTrader == nil {
		return nil, fmt.Errorf("dbTrader is nil")
	}

	// Parse filter using GetFilter() method (handles double-encoded JSON)
	filter, err := dbTrader.GetFilter()
	if err != nil {
		return nil, fmt.Errorf("failed to parse filter: %w", err)
	}

	// Validate filter has required fields
	if filter.Code == "" {
		return nil, fmt.Errorf("filter code is empty")
	}

	// Create TraderConfig from filter
	config := &TraderConfig{
		FilterCode:        filter.Code,
		SeriesCode:        filter.SeriesCode, // Add series code for indicator generation
		ScreeningInterval: 5 * time.Minute,   // Default
		Symbols:           []string{},        // Empty = screen all top symbols
		Timeframes:        filter.RequiredTimeframes,
		Indicators:        filter.Indicators, // No conversion needed - same type
		MaxSignalsPerRun:  10,                // Default limit
		TimeoutPerRun:     1 * time.Second,   // Default timeout
	}

	log.Printf("[Manager] DEBUG: Trader %s (%s) - Timeframes: %v", dbTrader.ID, dbTrader.Name, config.Timeframes)

	// Handle empty user_id for built-in traders
	userID := dbTrader.UserID
	if userID == "" {
		userID = "system" // Synthetic user ID for quota tracking
	}

	// Create runtime Trader using NewTrader constructor
	return NewTrader(
		dbTrader.ID,
		userID,
		dbTrader.Name,
		dbTrader.Description,
		config,
	), nil
}
