package errors

import (
	"errors"
	"fmt"
)

// Common error types
var (
	// Storage errors
	ErrNotFound          = errors.New("not found")
	ErrAlreadyExists     = errors.New("already exists")
	ErrStorageUnavailable = errors.New("storage unavailable")
	ErrInvalidData       = errors.New("invalid data")

	// WebSocket errors
	ErrWebSocketDisconnected = errors.New("websocket disconnected")
	ErrWebSocketTimeout      = errors.New("websocket timeout")
	ErrWebSocketClosed       = errors.New("websocket closed")

	// Filter execution errors
	ErrFilterCompilation = errors.New("filter compilation failed")
	ErrFilterExecution   = errors.New("filter execution failed")
	ErrFilterTimeout     = errors.New("filter execution timeout")

	// Trading errors
	ErrInsufficientBalance = errors.New("insufficient balance")
	ErrInvalidOrder        = errors.New("invalid order")
	ErrOrderFailed         = errors.New("order failed")
	ErrPositionNotFound    = errors.New("position not found")

	// Validation errors
	ErrInvalidSymbol   = errors.New("invalid symbol")
	ErrInvalidPrice    = errors.New("invalid price")
	ErrInvalidQuantity = errors.New("invalid quantity")
	ErrInvalidTimeframe = errors.New("invalid timeframe")

	// Engine errors
	ErrEngineNotRunning = errors.New("engine not running")
	ErrEngineShutdown   = errors.New("engine is shutting down")
	ErrComponentFailed  = errors.New("component failed")
)

// TraderError wraps errors specific to trader operations
type TraderError struct {
	TraderID string
	Op       string // Operation that failed
	Err      error
}

func (e *TraderError) Error() string {
	return fmt.Sprintf("trader %s: %s: %v", e.TraderID, e.Op, e.Err)
}

func (e *TraderError) Unwrap() error {
	return e.Err
}

// NewTraderError creates a new trader error
func NewTraderError(traderID, op string, err error) *TraderError {
	return &TraderError{
		TraderID: traderID,
		Op:       op,
		Err:      err,
	}
}

// SignalError wraps errors specific to signal operations
type SignalError struct {
	SignalID string
	Op       string
	Err      error
}

func (e *SignalError) Error() string {
	return fmt.Sprintf("signal %s: %s: %v", e.SignalID, e.Op, e.Err)
}

func (e *SignalError) Unwrap() error {
	return e.Err
}

// NewSignalError creates a new signal error
func NewSignalError(signalID, op string, err error) *SignalError {
	return &SignalError{
		SignalID: signalID,
		Op:       op,
		Err:      err,
	}
}

// PositionError wraps errors specific to position operations
type PositionError struct {
	PositionID string
	Op         string
	Err        error
}

func (e *PositionError) Error() string {
	return fmt.Sprintf("position %s: %s: %v", e.PositionID, e.Op, e.Err)
}

func (e *PositionError) Unwrap() error {
	return e.Err
}

// NewPositionError creates a new position error
func NewPositionError(positionID, op string, err error) *PositionError {
	return &PositionError{
		PositionID: positionID,
		Op:         op,
		Err:        err,
	}
}

// WebSocketError wraps WebSocket-specific errors
type WebSocketError struct {
	Symbol string
	Op     string
	Err    error
}

func (e *WebSocketError) Error() string {
	if e.Symbol != "" {
		return fmt.Sprintf("websocket %s: %s: %v", e.Symbol, e.Op, e.Err)
	}
	return fmt.Sprintf("websocket: %s: %v", e.Op, e.Err)
}

func (e *WebSocketError) Unwrap() error {
	return e.Err
}

// NewWebSocketError creates a new WebSocket error
func NewWebSocketError(symbol, op string, err error) *WebSocketError {
	return &WebSocketError{
		Symbol: symbol,
		Op:     op,
		Err:    err,
	}
}

// IsRetryable checks if an error is retryable
func IsRetryable(err error) bool {
	if err == nil {
		return false
	}

	// Check for specific retryable errors
	if errors.Is(err, ErrWebSocketDisconnected) ||
		errors.Is(err, ErrWebSocketTimeout) ||
		errors.Is(err, ErrStorageUnavailable) {
		return true
	}

	return false
}

// IsPermanent checks if an error is permanent (not retryable)
func IsPermanent(err error) bool {
	if err == nil {
		return false
	}

	// Check for specific permanent errors
	if errors.Is(err, ErrInvalidData) ||
		errors.Is(err, ErrInvalidSymbol) ||
		errors.Is(err, ErrInvalidPrice) ||
		errors.Is(err, ErrInvalidQuantity) ||
		errors.Is(err, ErrFilterCompilation) {
		return true
	}

	return false
}
