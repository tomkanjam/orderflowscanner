package trader

import (
	"fmt"
	"sync"
	"testing"
	"time"
)

func createTestTrader(id, userID string) *Trader {
	config := &TraderConfig{
		FilterCode:        "test code",
		ScreeningInterval: 60 * time.Second,
	}
	return NewTrader(id, userID, fmt.Sprintf("Test Trader %s", id), "Test", config)
}

func TestNewRegistry(t *testing.T) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	if registry == nil {
		t.Fatal("NewRegistry returned nil")
	}

	if registry.metrics == nil {
		t.Error("Registry metrics should not be nil")
	}

	if registry.stopCleanup == nil {
		t.Error("Registry stopCleanup channel should not be nil")
	}
}

func TestNewRegistry_WithConfig(t *testing.T) {
	config := &RegistryConfig{
		CleanupInterval: 30 * time.Second,
		CleanupDelay:    2 * time.Minute,
	}

	registry := NewRegistry(config)
	defer registry.Stop()

	if registry.cleanupInterval != 30*time.Second {
		t.Errorf("cleanupInterval = %v, want %v", registry.cleanupInterval, 30*time.Second)
	}

	if registry.cleanupDelay != 2*time.Minute {
		t.Errorf("cleanupDelay = %v, want %v", registry.cleanupDelay, 2*time.Minute)
	}
}

func TestRegistry_Register(t *testing.T) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	trader := createTestTrader("test-1", "user-123")

	err := registry.Register(trader)
	if err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	// Verify trader is in registry
	retrieved, ok := registry.Get("test-1")
	if !ok {
		t.Fatal("Trader should be in registry")
	}

	if retrieved.ID != trader.ID {
		t.Errorf("Retrieved trader ID = %v, want %v", retrieved.ID, trader.ID)
	}

	// Verify metrics
	if registry.metrics.ActiveCount != 1 {
		t.Errorf("ActiveCount = %v, want 1", registry.metrics.ActiveCount)
	}
}

func TestRegistry_Register_Nil(t *testing.T) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	err := registry.Register(nil)
	if err == nil {
		t.Error("Register(nil) should return error")
	}
}

func TestRegistry_Register_EmptyID(t *testing.T) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	trader := createTestTrader("", "user-123")
	err := registry.Register(trader)
	if err == nil {
		t.Error("Register with empty ID should return error")
	}
}

func TestRegistry_Register_Duplicate(t *testing.T) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	trader1 := createTestTrader("test-1", "user-123")
	trader2 := createTestTrader("test-1", "user-456") // Same ID

	err := registry.Register(trader1)
	if err != nil {
		t.Fatalf("First Register failed: %v", err)
	}

	err = registry.Register(trader2)
	if err == nil {
		t.Error("Register with duplicate ID should return error")
	}
}

func TestRegistry_Unregister(t *testing.T) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	trader := createTestTrader("test-1", "user-123")
	_ = registry.Register(trader)

	err := registry.Unregister("test-1")
	if err != nil {
		t.Fatalf("Unregister failed: %v", err)
	}

	// Verify trader is removed
	_, ok := registry.Get("test-1")
	if ok {
		t.Error("Trader should not be in registry after unregister")
	}

	// Verify metrics
	if registry.metrics.ActiveCount != 0 {
		t.Errorf("ActiveCount = %v, want 0", registry.metrics.ActiveCount)
	}
}

func TestRegistry_Unregister_NotFound(t *testing.T) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	err := registry.Unregister("nonexistent")
	if err == nil {
		t.Error("Unregister nonexistent trader should return error")
	}
}

func TestRegistry_Get(t *testing.T) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	trader := createTestTrader("test-1", "user-123")
	_ = registry.Register(trader)

	retrieved, ok := registry.Get("test-1")
	if !ok {
		t.Fatal("Get should return true for existing trader")
	}

	if retrieved.ID != "test-1" {
		t.Errorf("Retrieved trader ID = %v, want test-1", retrieved.ID)
	}
}

func TestRegistry_Get_NotFound(t *testing.T) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	_, ok := registry.Get("nonexistent")
	if ok {
		t.Error("Get should return false for nonexistent trader")
	}
}

func TestRegistry_Exists(t *testing.T) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	trader := createTestTrader("test-1", "user-123")
	_ = registry.Register(trader)

	if !registry.Exists("test-1") {
		t.Error("Exists should return true for existing trader")
	}

	if registry.Exists("nonexistent") {
		t.Error("Exists should return false for nonexistent trader")
	}
}

func TestRegistry_List(t *testing.T) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	// Register multiple traders
	for i := 1; i <= 5; i++ {
		trader := createTestTrader(fmt.Sprintf("test-%d", i), "user-123")
		_ = registry.Register(trader)
	}

	traders := registry.List()

	if len(traders) != 5 {
		t.Errorf("List returned %d traders, want 5", len(traders))
	}

	// Verify all traders are present
	ids := make(map[string]bool)
	for _, trader := range traders {
		ids[trader.ID] = true
	}

	for i := 1; i <= 5; i++ {
		expectedID := fmt.Sprintf("test-%d", i)
		if !ids[expectedID] {
			t.Errorf("Trader %s not found in list", expectedID)
		}
	}
}

func TestRegistry_GetByUser(t *testing.T) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	// Register traders for different users
	_ = registry.Register(createTestTrader("test-1", "user-123"))
	_ = registry.Register(createTestTrader("test-2", "user-123"))
	_ = registry.Register(createTestTrader("test-3", "user-456"))

	// Get traders for user-123
	traders := registry.GetByUser("user-123")

	if len(traders) != 2 {
		t.Errorf("GetByUser returned %d traders, want 2", len(traders))
	}

	for _, trader := range traders {
		if trader.UserID != "user-123" {
			t.Errorf("Trader %s has userID %s, want user-123", trader.ID, trader.UserID)
		}
	}

	// Get traders for user-456
	traders = registry.GetByUser("user-456")

	if len(traders) != 1 {
		t.Errorf("GetByUser returned %d traders, want 1", len(traders))
	}

	// Get traders for nonexistent user
	traders = registry.GetByUser("user-999")

	if len(traders) != 0 {
		t.Errorf("GetByUser returned %d traders, want 0", len(traders))
	}
}

func TestRegistry_GetByState(t *testing.T) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	// Register traders in different states
	trader1 := createTestTrader("test-1", "user-123")
	trader2 := createTestTrader("test-2", "user-123")
	trader3 := createTestTrader("test-3", "user-123")

	_ = registry.Register(trader1)
	_ = registry.Register(trader2)
	_ = registry.Register(trader3)

	// Set different states
	trader1.mu.Lock()
	trader1.state = StateRunning
	trader1.mu.Unlock()

	trader2.mu.Lock()
	trader2.state = StateRunning
	trader2.mu.Unlock()

	trader3.mu.Lock()
	trader3.state = StateStopped
	trader3.mu.Unlock()

	// Get running traders
	runningTraders := registry.GetByState(StateRunning)
	if len(runningTraders) != 2 {
		t.Errorf("GetByState(running) returned %d traders, want 2", len(runningTraders))
	}

	// Get stopped traders
	stoppedTraders := registry.GetByState(StateStopped)
	if len(stoppedTraders) != 1 {
		t.Errorf("GetByState(stopped) returned %d traders, want 1", len(stoppedTraders))
	}
}

func TestRegistry_Count(t *testing.T) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	if registry.Count() != 0 {
		t.Errorf("Count = %d, want 0", registry.Count())
	}

	// Register 3 traders
	for i := 1; i <= 3; i++ {
		trader := createTestTrader(fmt.Sprintf("test-%d", i), "user-123")
		_ = registry.Register(trader)
	}

	if registry.Count() != 3 {
		t.Errorf("Count = %d, want 3", registry.Count())
	}

	// Unregister 1 trader
	_ = registry.Unregister("test-1")

	if registry.Count() != 2 {
		t.Errorf("Count = %d, want 2", registry.Count())
	}
}

func TestRegistry_CountByUser(t *testing.T) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	// Register traders for different users
	_ = registry.Register(createTestTrader("test-1", "user-123"))
	_ = registry.Register(createTestTrader("test-2", "user-123"))
	_ = registry.Register(createTestTrader("test-3", "user-456"))

	count := registry.CountByUser("user-123")
	if count != 2 {
		t.Errorf("CountByUser(user-123) = %d, want 2", count)
	}

	count = registry.CountByUser("user-456")
	if count != 1 {
		t.Errorf("CountByUser(user-456) = %d, want 1", count)
	}

	count = registry.CountByUser("user-999")
	if count != 0 {
		t.Errorf("CountByUser(user-999) = %d, want 0", count)
	}
}

func TestRegistry_ConcurrentRegister(t *testing.T) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	var wg sync.WaitGroup
	numGoroutines := 100

	// Register 100 traders concurrently
	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			trader := createTestTrader(fmt.Sprintf("test-%d", id), "user-123")
			_ = registry.Register(trader)
		}(i)
	}

	wg.Wait()

	// Verify all traders are registered
	count := registry.Count()
	if count != numGoroutines {
		t.Errorf("Count = %d, want %d", count, numGoroutines)
	}
}

func TestRegistry_ConcurrentRegisterAndUnregister(t *testing.T) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	var wg sync.WaitGroup
	numOps := 100

	// Register and unregister traders concurrently
	for i := 0; i < numOps; i++ {
		wg.Add(2)

		// Register
		go func(id int) {
			defer wg.Done()
			trader := createTestTrader(fmt.Sprintf("test-%d", id), "user-123")
			_ = registry.Register(trader)
		}(i)

		// Unregister (may fail if not registered yet)
		go func(id int) {
			defer wg.Done()
			time.Sleep(10 * time.Millisecond) // Small delay to let register happen first
			_ = registry.Unregister(fmt.Sprintf("test-%d", id))
		}(i)
	}

	wg.Wait()

	// Should not panic or deadlock
	count := registry.Count()
	t.Logf("Final count after concurrent ops: %d", count)
}

func TestRegistry_ConcurrentGet(t *testing.T) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	// Register 10 traders
	for i := 0; i < 10; i++ {
		trader := createTestTrader(fmt.Sprintf("test-%d", i), "user-123")
		_ = registry.Register(trader)
	}

	var wg sync.WaitGroup
	numReaders := 100

	// 100 goroutines reading concurrently
	for i := 0; i < numReaders; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 10; j++ {
				_ = registry.List()
				_ = registry.GetByUser("user-123")
				_, _ = registry.Get("test-5")
			}
		}()
	}

	wg.Wait()
	// Should not panic or deadlock
}

func TestRegistry_Cleanup(t *testing.T) {
	// Use short cleanup intervals for testing
	config := &RegistryConfig{
		CleanupInterval: 100 * time.Millisecond,
		CleanupDelay:    200 * time.Millisecond,
	}

	registry := NewRegistry(config)
	defer registry.Stop()

	// Register a trader
	trader := createTestTrader("test-1", "user-123")
	_ = registry.Register(trader)

	// Set to stopped state with old timestamp
	trader.mu.Lock()
	trader.state = StateStopped
	trader.stoppedAt = time.Now().Add(-1 * time.Second) // Stopped 1 second ago
	trader.mu.Unlock()

	// Wait for cleanup to run (cleanup runs every 100ms, removes after 200ms)
	time.Sleep(500 * time.Millisecond)

	// Trader should be removed
	if registry.Exists("test-1") {
		t.Error("Stopped trader should be removed by cleanup")
	}
}

func TestRegistry_Cleanup_OnlyRemovesOldTraders(t *testing.T) {
	config := &RegistryConfig{
		CleanupInterval: 100 * time.Millisecond,
		CleanupDelay:    1 * time.Second,
	}

	registry := NewRegistry(config)
	defer registry.Stop()

	// Register a recently stopped trader
	trader := createTestTrader("test-1", "user-123")
	_ = registry.Register(trader)

	trader.mu.Lock()
	trader.state = StateStopped
	trader.stoppedAt = time.Now() // Just stopped now
	trader.mu.Unlock()

	// Wait for cleanup to run
	time.Sleep(300 * time.Millisecond)

	// Trader should NOT be removed (not old enough)
	if !registry.Exists("test-1") {
		t.Error("Recently stopped trader should not be removed by cleanup")
	}
}

func TestRegistry_Cleanup_OnlyRemovesStoppedTraders(t *testing.T) {
	config := &RegistryConfig{
		CleanupInterval: 100 * time.Millisecond,
		CleanupDelay:    200 * time.Millisecond,
	}

	registry := NewRegistry(config)
	defer registry.Stop()

	// Register a running trader
	trader := createTestTrader("test-1", "user-123")
	_ = registry.Register(trader)

	trader.mu.Lock()
	trader.state = StateRunning
	trader.startedAt = time.Now().Add(-2 * time.Second) // Started 2 seconds ago
	trader.mu.Unlock()

	// Wait for cleanup to run
	time.Sleep(500 * time.Millisecond)

	// Running trader should NOT be removed
	if !registry.Exists("test-1") {
		t.Error("Running trader should not be removed by cleanup")
	}
}

func TestRegistry_Stop(t *testing.T) {
	registry := NewRegistry(nil)

	// Register some traders
	for i := 0; i < 5; i++ {
		trader := createTestTrader(fmt.Sprintf("test-%d", i), "user-123")
		_ = registry.Register(trader)
	}

	// Stop registry
	registry.Stop()

	// Cleanup goroutine should have stopped
	// If this test completes without hanging, Stop() worked correctly
}

func TestRegistry_Clear(t *testing.T) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	// Register traders
	for i := 0; i < 5; i++ {
		trader := createTestTrader(fmt.Sprintf("test-%d", i), "user-123")
		_ = registry.Register(trader)
	}

	if registry.Count() != 5 {
		t.Errorf("Count = %d, want 5", registry.Count())
	}

	// Clear registry
	registry.Clear()

	if registry.Count() != 0 {
		t.Errorf("Count after Clear = %d, want 0", registry.Count())
	}

	// Metrics should be reset
	if registry.metrics.ActiveCount != 0 {
		t.Errorf("ActiveCount after Clear = %d, want 0", registry.metrics.ActiveCount)
	}
}

func TestRegistry_GetMetrics(t *testing.T) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	// Register traders
	trader1 := createTestTrader("test-1", "user-123")
	trader2 := createTestTrader("test-2", "user-123")
	_ = registry.Register(trader1)
	_ = registry.Register(trader2)

	// Set different states
	trader1.mu.Lock()
	trader1.state = StateRunning
	trader1.mu.Unlock()

	metrics := registry.GetMetrics()

	if metrics["active_count"].(int64) != 2 {
		t.Errorf("active_count = %v, want 2", metrics["active_count"])
	}

	if metrics["total_registered"].(int64) != 2 {
		t.Errorf("total_registered = %v, want 2", metrics["total_registered"])
	}

	// Unregister one
	_ = registry.Unregister("test-1")

	metrics = registry.GetMetrics()

	if metrics["active_count"].(int64) != 1 {
		t.Errorf("active_count after unregister = %v, want 1", metrics["active_count"])
	}

	if metrics["total_unregistered"].(int64) != 1 {
		t.Errorf("total_unregistered = %v, want 1", metrics["total_unregistered"])
	}
}

func BenchmarkRegistry_Register(b *testing.B) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		trader := createTestTrader(fmt.Sprintf("test-%d", i), "user-123")
		_ = registry.Register(trader)
	}
}

func BenchmarkRegistry_Get(b *testing.B) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	// Pre-register traders
	for i := 0; i < 1000; i++ {
		trader := createTestTrader(fmt.Sprintf("test-%d", i), "user-123")
		_ = registry.Register(trader)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = registry.Get(fmt.Sprintf("test-%d", i%1000))
	}
}

func BenchmarkRegistry_List(b *testing.B) {
	registry := NewRegistry(nil)
	defer registry.Stop()

	// Pre-register traders
	for i := 0; i < 100; i++ {
		trader := createTestTrader(fmt.Sprintf("test-%d", i), "user-123")
		_ = registry.Register(trader)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = registry.List()
	}
}
