package trader

import (
	"errors"
	"sync"
	"testing"
	"time"
)

func TestTraderState_String(t *testing.T) {
	tests := []struct {
		state    TraderState
		expected string
	}{
		{StateStopped, "stopped"},
		{StateStarting, "starting"},
		{StateRunning, "running"},
		{StateStopping, "stopping"},
		{StateError, "error"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			if got := tt.state.String(); got != tt.expected {
				t.Errorf("String() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestTraderState_IsValid(t *testing.T) {
	tests := []struct {
		state    TraderState
		expected bool
	}{
		{StateStopped, true},
		{StateStarting, true},
		{StateRunning, true},
		{StateStopping, true},
		{StateError, true},
		{TraderState("invalid"), false},
		{TraderState(""), false},
	}

	for _, tt := range tests {
		t.Run(string(tt.state), func(t *testing.T) {
			if got := tt.state.IsValid(); got != tt.expected {
				t.Errorf("IsValid() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestNewTrader(t *testing.T) {
	config := &TraderConfig{
		FilterCode:        "test code",
		ScreeningInterval: 60 * time.Second,
	}

	trader := NewTrader("test-id", "user-123", "Test Trader", "Test description", config)

	if trader.ID != "test-id" {
		t.Errorf("ID = %v, want %v", trader.ID, "test-id")
	}

	if trader.UserID != "user-123" {
		t.Errorf("UserID = %v, want %v", trader.UserID, "user-123")
	}

	if trader.GetState() != StateStopped {
		t.Errorf("Initial state = %v, want %v", trader.GetState(), StateStopped)
	}

	if trader.ctx == nil {
		t.Error("Context should not be nil")
	}

	if trader.cancel == nil {
		t.Error("Cancel function should not be nil")
	}
}

func TestTrader_ValidTransitions(t *testing.T) {
	tests := []struct {
		name     string
		from     TraderState
		to       TraderState
		wantErr  bool
	}{
		// Valid transitions from stopped
		{"stopped → starting", StateStopped, StateStarting, false},
		{"stopped → running (invalid)", StateStopped, StateRunning, true},
		{"stopped → error (invalid)", StateStopped, StateError, true},

		// Valid transitions from starting
		{"starting → running", StateStarting, StateRunning, false},
		{"starting → error", StateStarting, StateError, false},
		{"starting → stopping", StateStarting, StateStopping, false},
		{"starting → stopped (invalid)", StateStarting, StateStopped, true},

		// Valid transitions from running
		{"running → stopping", StateRunning, StateStopping, false},
		{"running → error", StateRunning, StateError, false},
		{"running → stopped (invalid)", StateRunning, StateStopped, true},
		{"running → starting (invalid)", StateRunning, StateStarting, true},

		// Valid transitions from stopping
		{"stopping → stopped", StateStopping, StateStopped, false},
		{"stopping → error", StateStopping, StateError, false},
		{"stopping → running (invalid)", StateStopping, StateRunning, true},

		// Valid transitions from error
		{"error → stopped", StateError, StateStopped, false},
		{"error → running (invalid)", StateError, StateRunning, true},
		{"error → starting (invalid)", StateError, StateStarting, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			trader := NewTrader("test-id", "user-123", "Test", "Test", &TraderConfig{})

			// Set initial state directly (bypass validation for test setup)
			trader.mu.Lock()
			trader.state = tt.from
			trader.mu.Unlock()

			err := trader.TransitionTo(tt.to)

			if (err != nil) != tt.wantErr {
				t.Errorf("TransitionTo() error = %v, wantErr %v", err, tt.wantErr)
			}

			if err == nil && trader.GetState() != tt.to {
				t.Errorf("After transition, state = %v, want %v", trader.GetState(), tt.to)
			}

			if err != nil {
				var stateErr *StateTransitionError
				if !errors.As(err, &stateErr) {
					t.Errorf("Error should be StateTransitionError, got %T", err)
				}
			}
		})
	}
}

func TestTrader_TransitionTimestamps(t *testing.T) {
	trader := NewTrader("test-id", "user-123", "Test", "Test", &TraderConfig{})

	// stopped → starting
	if err := trader.TransitionTo(StateStarting); err != nil {
		t.Fatalf("TransitionTo(StateStarting) failed: %v", err)
	}

	// starting → running (should set startedAt)
	before := time.Now()
	if err := trader.TransitionTo(StateRunning); err != nil {
		t.Fatalf("TransitionTo(StateRunning) failed: %v", err)
	}
	after := time.Now()

	trader.mu.RLock()
	startedAt := trader.startedAt
	trader.mu.RUnlock()

	if startedAt.IsZero() {
		t.Error("startedAt should be set when transitioning to running")
	}

	if startedAt.Before(before) || startedAt.After(after) {
		t.Errorf("startedAt %v is outside expected range [%v, %v]", startedAt, before, after)
	}

	// running → stopping
	if err := trader.TransitionTo(StateStopping); err != nil {
		t.Fatalf("TransitionTo(StateStopping) failed: %v", err)
	}

	// stopping → stopped (should set stoppedAt)
	before = time.Now()
	if err := trader.TransitionTo(StateStopped); err != nil {
		t.Fatalf("TransitionTo(StateStopped) failed: %v", err)
	}
	after = time.Now()

	trader.mu.RLock()
	stoppedAt := trader.stoppedAt
	trader.mu.RUnlock()

	if stoppedAt.IsZero() {
		t.Error("stoppedAt should be set when transitioning to stopped")
	}

	if stoppedAt.Before(before) || stoppedAt.After(after) {
		t.Errorf("stoppedAt %v is outside expected range [%v, %v]", stoppedAt, before, after)
	}
}

func TestTrader_SetError(t *testing.T) {
	trader := NewTrader("test-id", "user-123", "Test", "Test", &TraderConfig{})

	// Start trader
	trader.mu.Lock()
	trader.state = StateRunning
	trader.mu.Unlock()

	// Set error
	testErr := errors.New("test error")
	if err := trader.SetError(testErr); err != nil {
		t.Fatalf("SetError() failed: %v", err)
	}

	// Check state
	if trader.GetState() != StateError {
		t.Errorf("State = %v, want %v", trader.GetState(), StateError)
	}

	// Check error is recorded
	trader.mu.RLock()
	lastError := trader.lastError
	trader.mu.RUnlock()

	if lastError == nil {
		t.Fatal("lastError should be set")
	}

	if lastError.Error() != testErr.Error() {
		t.Errorf("lastError = %v, want %v", lastError, testErr)
	}
}

func TestTrader_RecoverFromError(t *testing.T) {
	trader := NewTrader("test-id", "user-123", "Test", "Test", &TraderConfig{})

	// Set to error state
	trader.mu.Lock()
	trader.state = StateError
	trader.lastError = errors.New("previous error")
	trader.mu.Unlock()

	// Recover
	if err := trader.RecoverFromError(); err != nil {
		t.Fatalf("RecoverFromError() failed: %v", err)
	}

	// Check state
	if trader.GetState() != StateStopped {
		t.Errorf("State = %v, want %v", trader.GetState(), StateStopped)
	}

	// Error should still be recorded (for debugging)
	trader.mu.RLock()
	lastError := trader.lastError
	trader.mu.RUnlock()

	if lastError == nil {
		t.Error("lastError should be preserved after recovery")
	}
}

func TestTrader_RecoverFromError_InvalidState(t *testing.T) {
	trader := NewTrader("test-id", "user-123", "Test", "Test", &TraderConfig{})

	// Try to recover from stopped state (should fail)
	if err := trader.RecoverFromError(); err == nil {
		t.Error("RecoverFromError() should fail when not in error state")
	}
}

func TestTrader_ConcurrentStateAccess(t *testing.T) {
	trader := NewTrader("test-id", "user-123", "Test", "Test", &TraderConfig{})

	// Start 100 goroutines that read state
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				_ = trader.GetState()
				_ = trader.GetStatus()
			}
		}()
	}

	// Start 10 goroutines that try to transition state
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 10; j++ {
				_ = trader.TransitionTo(StateStarting)
				time.Sleep(time.Millisecond)
			}
		}()
	}

	wg.Wait()

	// Should not panic or deadlock
	finalState := trader.GetState()
	if !finalState.IsValid() {
		t.Errorf("Final state %v is invalid", finalState)
	}
}

func TestTrader_HelperMethods(t *testing.T) {
	trader := NewTrader("test-id", "user-123", "Test", "Test", &TraderConfig{})

	// Test IsStopped
	if !trader.IsStopped() {
		t.Error("New trader should be stopped")
	}

	// Test CanStart
	if !trader.CanStart() {
		t.Error("Stopped trader should be startable")
	}

	// Test CanStop
	if trader.CanStop() {
		t.Error("Stopped trader should not be stoppable")
	}

	// Transition to running
	trader.mu.Lock()
	trader.state = StateRunning
	trader.mu.Unlock()

	// Test IsRunning
	if !trader.IsRunning() {
		t.Error("Trader should be running")
	}

	// Test IsStopped
	if trader.IsStopped() {
		t.Error("Running trader should not be stopped")
	}

	// Test CanStart
	if trader.CanStart() {
		t.Error("Running trader should not be startable")
	}

	// Test CanStop
	if !trader.CanStop() {
		t.Error("Running trader should be stoppable")
	}
}

func TestTrader_GetStatus(t *testing.T) {
	config := &TraderConfig{
		FilterCode:        "test code",
		ScreeningInterval: 60 * time.Second,
	}

	trader := NewTrader("test-id", "user-123", "Test Trader", "Test description", config)

	// Initial status
	status := trader.GetStatus()

	if status.ID != "test-id" {
		t.Errorf("Status.ID = %v, want %v", status.ID, "test-id")
	}

	if status.UserID != "user-123" {
		t.Errorf("Status.UserID = %v, want %v", status.UserID, "user-123")
	}

	if status.Name != "Test Trader" {
		t.Errorf("Status.Name = %v, want %v", status.Name, "Test Trader")
	}

	if status.State != StateStopped {
		t.Errorf("Status.State = %v, want %v", status.State, StateStopped)
	}

	if status.SignalCount != 0 {
		t.Errorf("Status.SignalCount = %v, want 0", status.SignalCount)
	}

	// Transition to running
	trader.mu.Lock()
	trader.state = StateRunning
	trader.startedAt = time.Now().Add(-2 * time.Second) // Started 2 seconds ago
	trader.mu.Unlock()

	// Get status again
	status = trader.GetStatus()

	if status.State != StateRunning {
		t.Errorf("Status.State = %v, want %v", status.State, StateRunning)
	}

	if status.StartedAt == nil {
		t.Error("Status.StartedAt should not be nil for running trader")
	}

	if status.Uptime < 1 {
		t.Errorf("Status.Uptime = %v, want >= 1 second", status.Uptime)
	}
}

func TestTrader_IncrementSignalCount(t *testing.T) {
	trader := NewTrader("test-id", "user-123", "Test", "Test", &TraderConfig{})

	// Increment signal count concurrently
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			trader.IncrementSignalCount(1)
		}()
	}

	wg.Wait()

	trader.mu.RLock()
	signalCount := trader.signalCount
	trader.mu.RUnlock()

	if signalCount != 100 {
		t.Errorf("signalCount = %v, want 100", signalCount)
	}
}

func TestTrader_UpdateLastRunAt(t *testing.T) {
	trader := NewTrader("test-id", "user-123", "Test", "Test", &TraderConfig{})

	before := time.Now()
	trader.UpdateLastRunAt()
	after := time.Now()

	trader.mu.RLock()
	lastRunAt := trader.lastRunAt
	trader.mu.RUnlock()

	if lastRunAt.IsZero() {
		t.Error("lastRunAt should be set")
	}

	if lastRunAt.Before(before) || lastRunAt.After(after) {
		t.Errorf("lastRunAt %v is outside expected range [%v, %v]", lastRunAt, before, after)
	}
}

func TestTrader_Context(t *testing.T) {
	trader := NewTrader("test-id", "user-123", "Test", "Test", &TraderConfig{})

	ctx := trader.Context()
	if ctx == nil {
		t.Fatal("Context should not be nil")
	}

	// Context should not be cancelled initially
	select {
	case <-ctx.Done():
		t.Error("Context should not be cancelled initially")
	default:
		// OK
	}

	// Cancel context
	trader.Cancel()

	// Context should be cancelled
	select {
	case <-ctx.Done():
		// OK
	case <-time.After(100 * time.Millisecond):
		t.Error("Context should be cancelled after Cancel()")
	}
}
