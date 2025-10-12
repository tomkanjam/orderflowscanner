package trader

import (
	"fmt"
	"time"
)

// StateTransitionError represents an invalid state transition
type StateTransitionError struct {
	From TraderState
	To   TraderState
}

func (e *StateTransitionError) Error() string {
	return fmt.Sprintf("invalid state transition from %s to %s", e.From, e.To)
}

// validTransitions defines the allowed state transitions
// Format: currentState -> []allowedNextStates
var validTransitions = map[TraderState][]TraderState{
	StateStopped: {
		StateStarting, // stopped → starting (user starts trader)
	},
	StateStarting: {
		StateRunning,  // starting → running (initialization complete)
		StateError,    // starting → error (initialization failed)
		StateStopping, // starting → stopping (user cancels during startup)
	},
	StateRunning: {
		StateStopping, // running → stopping (user stops trader)
		StateError,    // running → error (crash during execution)
	},
	StateStopping: {
		StateStopped, // stopping → stopped (shutdown complete)
		StateError,   // stopping → error (error during shutdown)
	},
	StateError: {
		StateStopped, // error → stopped (manual recovery or auto-recovery)
	},
}

// CanTransition checks if a state transition is valid
func (t *Trader) CanTransition(to TraderState) bool {
	t.mu.RLock()
	currentState := t.state
	t.mu.RUnlock()

	// Check if target state is valid
	if !to.IsValid() {
		return false
	}

	// Look up allowed transitions
	allowedStates, exists := validTransitions[currentState]
	if !exists {
		return false
	}

	// Check if target state is in allowed list
	for _, allowed := range allowedStates {
		if allowed == to {
			return true
		}
	}

	return false
}

// TransitionTo attempts to transition the trader to a new state
// Returns an error if the transition is invalid
func (t *Trader) TransitionTo(to TraderState) error {
	t.mu.Lock()
	defer t.mu.Unlock()

	// Validate transition
	allowedStates, exists := validTransitions[t.state]
	if !exists {
		return &StateTransitionError{From: t.state, To: to}
	}

	allowed := false
	for _, state := range allowedStates {
		if state == to {
			allowed = true
			break
		}
	}

	if !allowed {
		return &StateTransitionError{From: t.state, To: to}
	}

	// Perform state-specific actions
	oldState := t.state
	t.state = to

	now := time.Now()

	switch to {
	case StateStarting:
		// Clear previous error state
		t.lastError = nil
		t.stoppedAt = time.Time{} // Zero value

	case StateRunning:
		// Record start time
		if t.startedAt.IsZero() {
			t.startedAt = now
		}
		// Clear error
		t.lastError = nil

	case StateStopping:
		// No additional actions needed

	case StateStopped:
		// Record stop time
		t.stoppedAt = now
		// Don't clear error - preserve it for debugging

	case StateError:
		// Stop time is when error occurred
		t.stoppedAt = now
		// lastError should be set by caller before calling TransitionTo
	}

	// Record metrics
	RecordStateTransition(oldState, to)

	// Update active traders gauge
	TradersActive.WithLabelValues(string(to)).Inc()
	if oldState != to {
		TradersActive.WithLabelValues(string(oldState)).Dec()
	}

	return nil
}

// SetError transitions to error state and records the error
func (t *Trader) SetError(err error) error {
	t.mu.Lock()
	t.lastError = err
	traderID := t.ID
	t.mu.Unlock()

	// Record error metric
	RecordError(traderID, "trader_error")

	return t.TransitionTo(StateError)
}

// RecoverFromError transitions from error state back to stopped
// This is used for manual recovery or auto-recovery after cooldown
func (t *Trader) RecoverFromError() error {
	t.mu.RLock()
	currentState := t.state
	t.mu.RUnlock()

	if currentState != StateError {
		return fmt.Errorf("cannot recover: trader is not in error state (current: %s)", currentState)
	}

	return t.TransitionTo(StateStopped)
}

// IsRunning returns true if the trader is currently running
func (t *Trader) IsRunning() bool {
	return t.GetState() == StateRunning
}

// IsStopped returns true if the trader is stopped
func (t *Trader) IsStopped() bool {
	state := t.GetState()
	return state == StateStopped || state == StateError
}

// CanStart returns true if the trader can be started
func (t *Trader) CanStart() bool {
	state := t.GetState()
	return state == StateStopped || state == StateError
}

// CanStop returns true if the trader can be stopped
func (t *Trader) CanStop() bool {
	state := t.GetState()
	return state == StateStarting || state == StateRunning
}
