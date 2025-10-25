package eventbus

import (
	"context"
	"log"
	"sync"
)

// EventBus provides in-memory pub/sub for system events
type EventBus struct {
	// Candle event subscriptions
	candleSubscribers []chan *CandleEvent
	candleMu          sync.RWMutex

	// Candle close event subscriptions
	candleCloseSubscribers []chan *CandleCloseEvent
	candleCloseMu          sync.RWMutex

	// Signal event subscriptions
	signalSubscribers []chan *SignalEvent
	signalMu          sync.RWMutex

	// Context for shutdown
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// NewEventBus creates a new event bus
func NewEventBus() *EventBus {
	ctx, cancel := context.WithCancel(context.Background())
	return &EventBus{
		candleSubscribers:      make([]chan *CandleEvent, 0),
		candleCloseSubscribers: make([]chan *CandleCloseEvent, 0),
		signalSubscribers:      make([]chan *SignalEvent, 0),
		ctx:                    ctx,
		cancel:                 cancel,
	}
}

// Start initializes the event bus
func (b *EventBus) Start() error {
	log.Printf("[EventBus] Starting...")
	log.Printf("[EventBus] ✅ Started successfully")
	return nil
}

// Stop gracefully shuts down the event bus
func (b *EventBus) Stop() error {
	log.Printf("[EventBus] Shutting down...")

	// Cancel context
	b.cancel()

	// Close all subscriber channels
	b.candleMu.Lock()
	for _, ch := range b.candleSubscribers {
		close(ch)
	}
	b.candleSubscribers = nil
	b.candleMu.Unlock()

	b.candleCloseMu.Lock()
	for _, ch := range b.candleCloseSubscribers {
		close(ch)
	}
	b.candleCloseSubscribers = nil
	b.candleCloseMu.Unlock()

	b.signalMu.Lock()
	for _, ch := range b.signalSubscribers {
		close(ch)
	}
	b.signalSubscribers = nil
	b.signalMu.Unlock()

	// Wait for all goroutines
	b.wg.Wait()

	log.Printf("[EventBus] ✅ Stopped successfully")
	return nil
}

// PublishCandleEvent publishes a candle open event to all subscribers
func (b *EventBus) PublishCandleEvent(event *CandleEvent) {
	b.candleMu.RLock()
	defer b.candleMu.RUnlock()

	// Send to all subscribers (non-blocking)
	for _, ch := range b.candleSubscribers {
		select {
		case ch <- event:
			// Sent successfully
		default:
			// Subscriber's channel is full, skip (prevents blocking)
			log.Printf("[EventBus] Warning: Candle subscriber channel full, dropping event for %s/%s",
				event.Symbol, event.Interval)
		}
	}
}

// SubscribeCandles creates a new subscription to candle events
// Returns a channel that receives CandleEvent pointers
// The channel is buffered with 1000 capacity
func (b *EventBus) SubscribeCandles() <-chan *CandleEvent {
	b.candleMu.Lock()
	defer b.candleMu.Unlock()

	// Create buffered channel
	ch := make(chan *CandleEvent, 1000)
	b.candleSubscribers = append(b.candleSubscribers, ch)

	log.Printf("[EventBus] New candle subscription (total: %d)", len(b.candleSubscribers))

	return ch
}

// PublishSignalEvent publishes a signal event to all subscribers
func (b *EventBus) PublishSignalEvent(event *SignalEvent) {
	b.signalMu.RLock()
	defer b.signalMu.RUnlock()

	// Send to all subscribers (non-blocking)
	for _, ch := range b.signalSubscribers {
		select {
		case ch <- event:
			// Sent successfully
		default:
			// Subscriber's channel is full, skip
			log.Printf("[EventBus] Warning: Signal subscriber channel full, dropping event for signal %s",
				event.SignalID)
		}
	}
}

// SubscribeSignals creates a new subscription to signal events
// Returns a channel that receives SignalEvent pointers
// The channel is buffered with 1000 capacity
func (b *EventBus) SubscribeSignals() <-chan *SignalEvent {
	b.signalMu.Lock()
	defer b.signalMu.Unlock()

	// Create buffered channel
	ch := make(chan *SignalEvent, 1000)
	b.signalSubscribers = append(b.signalSubscribers, ch)

	log.Printf("[EventBus] New signal subscription (total: %d)", len(b.signalSubscribers))

	return ch
}

// GetCandleSubscriberCount returns the number of active candle subscribers
func (b *EventBus) GetCandleSubscriberCount() int {
	b.candleMu.RLock()
	defer b.candleMu.RUnlock()
	return len(b.candleSubscribers)
}

// GetSignalSubscriberCount returns the number of active signal subscribers
func (b *EventBus) GetSignalSubscriberCount() int {
	b.signalMu.RLock()
	defer b.signalMu.RUnlock()
	return len(b.signalSubscribers)
}

// PublishCandleCloseEvent publishes a candle close event to all subscribers
func (b *EventBus) PublishCandleCloseEvent(event *CandleCloseEvent) {
	b.candleCloseMu.RLock()
	defer b.candleCloseMu.RUnlock()

	// Send to all subscribers (non-blocking)
	for _, ch := range b.candleCloseSubscribers {
		select {
		case ch <- event:
			// Sent successfully
		default:
			// Subscriber's channel is full, skip (prevents blocking)
			log.Printf("[EventBus] Warning: Candle close subscriber channel full, dropping event for %s/%s",
				event.Symbol, event.Interval)
		}
	}
}

// SubscribeCandleClose creates a new subscription to candle close events
// Returns a channel that receives CandleCloseEvent pointers
// The channel is buffered with 1000 capacity
func (b *EventBus) SubscribeCandleClose() <-chan *CandleCloseEvent {
	b.candleCloseMu.Lock()
	defer b.candleCloseMu.Unlock()

	// Create buffered channel
	ch := make(chan *CandleCloseEvent, 1000)
	b.candleCloseSubscribers = append(b.candleCloseSubscribers, ch)

	log.Printf("[EventBus] New candle close subscription (total: %d)", len(b.candleCloseSubscribers))

	return ch
}

// GetCandleCloseSubscriberCount returns the number of active candle close subscribers
func (b *EventBus) GetCandleCloseSubscriberCount() int {
	b.candleCloseMu.RLock()
	defer b.candleCloseMu.RUnlock()
	return len(b.candleCloseSubscribers)
}
