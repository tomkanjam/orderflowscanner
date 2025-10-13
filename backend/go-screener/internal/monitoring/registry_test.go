package monitoring

import (
	"context"
	"fmt"
	"testing"
	"time"
)

func TestNewRegistry(t *testing.T) {
	registry := NewRegistry()
	if registry == nil {
		t.Fatal("Registry is nil")
	}

	if registry.Count() != 0 {
		t.Errorf("Expected 0 monitors, got %d", registry.Count())
	}
}

func TestRegistryAdd(t *testing.T) {
	registry := NewRegistry()

	monitor := &MonitoringState{
		SignalID:      "signal-123",
		TraderID:      "trader-456",
		UserID:        "user-789",
		Symbol:        "BTCUSDT",
		Interval:      "5m",
		MaxReanalyses: 5,
	}

	err := registry.Add(monitor)
	if err != nil {
		t.Fatalf("Failed to add monitor: %v", err)
	}

	if registry.Count() != 1 {
		t.Errorf("Expected 1 monitor, got %d", registry.Count())
	}

	// Check defaults were set
	if monitor.MonitoringStarted.IsZero() {
		t.Error("MonitoringStarted not set")
	}
	if monitor.CreatedAt.IsZero() {
		t.Error("CreatedAt not set")
	}
	if !monitor.IsActive {
		t.Error("Monitor should be active")
	}
}

func TestRegistryAddRequiresSignalID(t *testing.T) {
	registry := NewRegistry()

	monitor := &MonitoringState{
		TraderID: "trader-456",
		Symbol:   "BTCUSDT",
	}

	err := registry.Add(monitor)
	if err == nil {
		t.Error("Expected error when adding monitor without signal_id")
	}
}

func TestRegistryGet(t *testing.T) {
	registry := NewRegistry()

	monitor := &MonitoringState{
		SignalID: "signal-123",
		TraderID: "trader-456",
		Symbol:   "BTCUSDT",
		Interval: "5m",
	}

	registry.Add(monitor)

	// Get existing monitor
	retrieved, ok := registry.Get("signal-123")
	if !ok {
		t.Error("Monitor not found")
	}
	if retrieved.SignalID != "signal-123" {
		t.Errorf("Expected signal-123, got %s", retrieved.SignalID)
	}

	// Get non-existent monitor
	_, ok = registry.Get("non-existent")
	if ok {
		t.Error("Expected not found for non-existent monitor")
	}
}

func TestRegistryGetActive(t *testing.T) {
	registry := NewRegistry()

	// Add active monitor
	active := &MonitoringState{
		SignalID: "signal-active",
		TraderID: "trader-1",
		Symbol:   "BTCUSDT",
		Interval: "5m",
	}
	registry.Add(active)

	// Add inactive monitor
	inactive := &MonitoringState{
		SignalID: "signal-inactive",
		TraderID: "trader-2",
		Symbol:   "ETHUSDT",
		Interval: "1h",
	}
	registry.Add(inactive)
	registry.Deactivate("signal-inactive")

	// Get active only
	activeMonitors := registry.GetActive()
	if len(activeMonitors) != 1 {
		t.Errorf("Expected 1 active monitor, got %d", len(activeMonitors))
	}
	if activeMonitors[0].SignalID != "signal-active" {
		t.Errorf("Expected signal-active, got %s", activeMonitors[0].SignalID)
	}
}

func TestRegistryGetBySymbolInterval(t *testing.T) {
	registry := NewRegistry()

	// Add monitors
	registry.Add(&MonitoringState{
		SignalID: "signal-1",
		Symbol:   "BTCUSDT",
		Interval: "5m",
	})
	registry.Add(&MonitoringState{
		SignalID: "signal-2",
		Symbol:   "BTCUSDT",
		Interval: "5m",
	})
	registry.Add(&MonitoringState{
		SignalID: "signal-3",
		Symbol:   "ETHUSDT",
		Interval: "5m",
	})
	registry.Add(&MonitoringState{
		SignalID: "signal-4",
		Symbol:   "BTCUSDT",
		Interval: "1h",
	})

	// Query BTCUSDT 5m
	matches := registry.GetBySymbolInterval("BTCUSDT", "5m")
	if len(matches) != 2 {
		t.Errorf("Expected 2 matches, got %d", len(matches))
	}

	// Query ETHUSDT 5m
	matches = registry.GetBySymbolInterval("ETHUSDT", "5m")
	if len(matches) != 1 {
		t.Errorf("Expected 1 match, got %d", len(matches))
	}

	// Query non-existent
	matches = registry.GetBySymbolInterval("SOLUSDT", "15m")
	if len(matches) != 0 {
		t.Errorf("Expected 0 matches, got %d", len(matches))
	}
}

func TestRegistryUpdate(t *testing.T) {
	registry := NewRegistry()

	monitor := &MonitoringState{
		SignalID:        "signal-123",
		ReanalysisCount: 0,
	}
	registry.Add(monitor)

	// Update
	monitor.ReanalysisCount = 3
	err := registry.Update(monitor)
	if err != nil {
		t.Fatalf("Failed to update: %v", err)
	}

	// Verify
	retrieved, _ := registry.Get("signal-123")
	if retrieved.ReanalysisCount != 3 {
		t.Errorf("Expected count 3, got %d", retrieved.ReanalysisCount)
	}

	// Update non-existent
	nonExistent := &MonitoringState{SignalID: "non-existent"}
	err = registry.Update(nonExistent)
	if err == nil {
		t.Error("Expected error when updating non-existent monitor")
	}
}

func TestRegistryDeactivate(t *testing.T) {
	registry := NewRegistry()

	monitor := &MonitoringState{
		SignalID: "signal-123",
	}
	registry.Add(monitor)

	// Deactivate
	err := registry.Deactivate("signal-123")
	if err != nil {
		t.Fatalf("Failed to deactivate: %v", err)
	}

	// Verify
	retrieved, _ := registry.Get("signal-123")
	if retrieved.IsActive {
		t.Error("Monitor should be inactive")
	}

	// Deactivate non-existent
	err = registry.Deactivate("non-existent")
	if err == nil {
		t.Error("Expected error when deactivating non-existent monitor")
	}
}

func TestRegistryRemove(t *testing.T) {
	registry := NewRegistry()

	monitor := &MonitoringState{
		SignalID: "signal-123",
	}
	registry.Add(monitor)

	if registry.Count() != 1 {
		t.Errorf("Expected 1 monitor, got %d", registry.Count())
	}

	// Remove
	registry.Remove("signal-123")

	if registry.Count() != 0 {
		t.Errorf("Expected 0 monitors after removal, got %d", registry.Count())
	}

	// Remove non-existent (should not error)
	registry.Remove("non-existent")
}

func TestRegistryCounts(t *testing.T) {
	registry := NewRegistry()

	// Add 3 monitors
	ids := []string{"signal-1", "signal-2", "signal-3"}
	for _, id := range ids {
		registry.Add(&MonitoringState{
			SignalID: id,
		})
	}

	if registry.Count() != 3 {
		t.Errorf("Expected 3 total, got %d", registry.Count())
	}
	if registry.CountActive() != 3 {
		t.Errorf("Expected 3 active, got %d", registry.CountActive())
	}

	// Deactivate 1
	registry.Deactivate("signal-1")

	if registry.Count() != 3 {
		t.Errorf("Expected 3 total, got %d", registry.Count())
	}
	if registry.CountActive() != 2 {
		t.Errorf("Expected 2 active, got %d", registry.CountActive())
	}
}

func TestRegistryClear(t *testing.T) {
	registry := NewRegistry()

	// Add monitors
	for i := 1; i <= 5; i++ {
		registry.Add(&MonitoringState{
			SignalID: fmt.Sprintf("signal-%d", i),
		})
	}

	if registry.Count() != 5 {
		t.Errorf("Expected 5 monitors, got %d", registry.Count())
	}

	// Clear
	registry.Clear()

	if registry.Count() != 0 {
		t.Errorf("Expected 0 monitors after clear, got %d", registry.Count())
	}
}

func TestRegistryCleanup(t *testing.T) {
	registry := NewRegistry()

	// Add active monitor
	registry.Add(&MonitoringState{
		SignalID: "signal-active",
	})

	// Add inactive monitor (recent)
	recentInactive := &MonitoringState{
		SignalID: "signal-recent-inactive",
	}
	registry.Add(recentInactive)
	registry.Deactivate("signal-recent-inactive")

	// Add inactive monitor (old) - manually set to inactive without updating timestamp
	oldInactive := &MonitoringState{
		SignalID:  "signal-old-inactive",
		IsActive:  false,
		UpdatedAt: time.Now().Add(-25 * time.Hour),
	}
	registry.mu.Lock()
	oldInactive.MonitoringStarted = time.Now().Add(-25 * time.Hour)
	oldInactive.CreatedAt = time.Now().Add(-25 * time.Hour)
	registry.monitors["signal-old-inactive"] = oldInactive
	registry.mu.Unlock()

	// Initial count
	if registry.Count() != 3 {
		t.Errorf("Expected 3 monitors, got %d", registry.Count())
	}

	// Cleanup (remove inactive older than 24h)
	removed := registry.Cleanup(context.Background(), 24*time.Hour)
	if removed != 1 {
		t.Errorf("Expected 1 removed, got %d", removed)
	}

	// Final count
	if registry.Count() != 2 {
		t.Errorf("Expected 2 monitors after cleanup, got %d", registry.Count())
	}

	// Verify old inactive was removed
	_, ok := registry.Get("signal-old-inactive")
	if ok {
		t.Error("Old inactive monitor should have been removed")
	}

	// Verify recent inactive still exists
	_, ok = registry.Get("signal-recent-inactive")
	if !ok {
		t.Error("Recent inactive monitor should still exist")
	}
}

func TestRegistryConcurrency(t *testing.T) {
	registry := NewRegistry()

	// Concurrent adds
	done := make(chan bool)
	for i := 0; i < 100; i++ {
		go func(id int) {
			monitor := &MonitoringState{
				SignalID: fmt.Sprintf("signal-%d", id),
			}
			registry.Add(monitor)
			done <- true
		}(i)
	}

	// Wait for all adds
	for i := 0; i < 100; i++ {
		<-done
	}

	if registry.Count() != 100 {
		t.Errorf("Expected 100 monitors, got %d", registry.Count())
	}

	// Concurrent reads
	for i := 0; i < 100; i++ {
		go func() {
			registry.GetActive()
			done <- true
		}()
	}

	// Wait for all reads
	for i := 0; i < 100; i++ {
		<-done
	}
}
