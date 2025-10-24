package eventbus

import (
	"testing"
	"time"
)

func TestNewEventBus(t *testing.T) {
	bus := NewEventBus()
	if bus == nil {
		t.Fatal("EventBus is nil")
	}

	if bus.ctx == nil {
		t.Error("Context is nil")
	}

	if bus.cancel == nil {
		t.Error("Cancel function is nil")
	}
}

func TestEventBusStartStop(t *testing.T) {
	bus := NewEventBus()

	err := bus.Start()
	if err != nil {
		t.Fatalf("Failed to start bus: %v", err)
	}

	err = bus.Stop()
	if err != nil {
		t.Fatalf("Failed to stop bus: %v", err)
	}
}

func TestCandleEventPubSub(t *testing.T) {
	bus := NewEventBus()
	err := bus.Start()
	if err != nil {
		t.Fatalf("Failed to start bus: %v", err)
	}
	defer bus.Stop()

	// Subscribe
	ch := bus.SubscribeCandles()
	if ch == nil {
		t.Fatal("Subscription channel is nil")
	}

	// Check subscriber count
	if bus.GetCandleSubscriberCount() != 1 {
		t.Errorf("Expected 1 subscriber, got %d", bus.GetCandleSubscriberCount())
	}

	// Publish event
	event := &CandleEvent{
		Symbol:   "BTCUSDT",
		Interval: "5m",
		OpenTime: time.Now(),
	}

	bus.PublishCandleEvent(event)

	// Receive event
	select {
	case received := <-ch:
		if received.Symbol != event.Symbol {
			t.Errorf("Expected symbol %s, got %s", event.Symbol, received.Symbol)
		}
		if received.Interval != event.Interval {
			t.Errorf("Expected interval %s, got %s", event.Interval, received.Interval)
		}
	case <-time.After(1 * time.Second):
		t.Error("Timeout waiting for event")
	}
}

func TestMultipleCandleSubscribers(t *testing.T) {
	bus := NewEventBus()
	err := bus.Start()
	if err != nil {
		t.Fatalf("Failed to start bus: %v", err)
	}
	defer bus.Stop()

	// Create multiple subscribers
	ch1 := bus.SubscribeCandles()
	ch2 := bus.SubscribeCandles()
	ch3 := bus.SubscribeCandles()

	if bus.GetCandleSubscriberCount() != 3 {
		t.Errorf("Expected 3 subscribers, got %d", bus.GetCandleSubscriberCount())
	}

	// Publish event
	event := &CandleEvent{
		Symbol:   "ETHUSDT",
		Interval: "1m",
		OpenTime: time.Now(),
	}

	bus.PublishCandleEvent(event)

	// All subscribers should receive the event
	received := 0
	timeout := time.After(1 * time.Second)

	for i := 0; i < 3; i++ {
		select {
		case <-ch1:
			received++
		case <-ch2:
			received++
		case <-ch3:
			received++
		case <-timeout:
			t.Errorf("Timeout: only received %d/3 events", received)
			return
		}
	}

	if received != 3 {
		t.Errorf("Expected 3 events received, got %d", received)
	}
}

func TestSignalEventPubSub(t *testing.T) {
	bus := NewEventBus()
	err := bus.Start()
	if err != nil {
		t.Fatalf("Failed to start bus: %v", err)
	}
	defer bus.Stop()

	// Subscribe
	ch := bus.SubscribeSignals()
	if ch == nil {
		t.Fatal("Subscription channel is nil")
	}

	// Publish event
	event := &SignalEvent{
		SignalID:  "signal-123",
		TraderID:  "trader-456",
		UserID:    "user-789",
		Symbol:    "BTCUSDT",
		Interval:  "5m",
		EventType: "created",
		Timestamp: time.Now(),
	}

	bus.PublishSignalEvent(event)

	// Receive event
	select {
	case received := <-ch:
		if received.SignalID != event.SignalID {
			t.Errorf("Expected signal ID %s, got %s", event.SignalID, received.SignalID)
		}
		if received.EventType != event.EventType {
			t.Errorf("Expected event type %s, got %s", event.EventType, received.EventType)
		}
	case <-time.After(1 * time.Second):
		t.Error("Timeout waiting for event")
	}
}

func TestEventBusNonBlockingPublish(t *testing.T) {
	bus := NewEventBus()
	err := bus.Start()
	if err != nil {
		t.Fatalf("Failed to start bus: %v", err)
	}
	defer bus.Stop()

	// Subscribe but don't read from channel
	_ = bus.SubscribeCandles()

	// Publish many events - should not block
	for i := 0; i < 2000; i++ {
		event := &CandleEvent{
			Symbol:   "BTCUSDT",
			Interval: "1m",
			OpenTime: time.Now(),
		}
		bus.PublishCandleEvent(event)
	}

	// If we get here without blocking, test passes
	t.Log("Published 2000 events without blocking")
}

func TestEventBusGracefulShutdown(t *testing.T) {
	bus := NewEventBus()
	err := bus.Start()
	if err != nil {
		t.Fatalf("Failed to start bus: %v", err)
	}

	// Subscribe
	ch := bus.SubscribeCandles()

	// Publish event
	event := &CandleEvent{
		Symbol:   "BTCUSDT",
		Interval: "5m",
		OpenTime: time.Now(),
	}
	bus.PublishCandleEvent(event)

	// Stop bus
	err = bus.Stop()
	if err != nil {
		t.Fatalf("Failed to stop bus: %v", err)
	}

	// Drain any buffered events and verify channel is closed
	timeout := time.After(100 * time.Millisecond)
	channelClosed := false

	for !channelClosed {
		select {
		case _, ok := <-ch:
			if !ok {
				// Channel is closed
				channelClosed = true
			}
			// Otherwise, received a buffered event, keep draining
		case <-timeout:
			t.Error("Channel not closed after Stop()")
			return
		}
	}

	// Verify channel is truly closed by trying to read again
	_, ok := <-ch
	if ok {
		t.Error("Channel should remain closed after Stop()")
	}
}

// Benchmark tests
func BenchmarkPublishCandleEvent(b *testing.B) {
	bus := NewEventBus()
	bus.Start()
	defer bus.Stop()

	// Create subscriber
	ch := bus.SubscribeCandles()

	// Consume events in background
	go func() {
		for range ch {
			// Discard
		}
	}()

	event := &CandleEvent{
		Symbol:   "BTCUSDT",
		Interval: "5m",
		OpenTime: time.Now(),
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		bus.PublishCandleEvent(event)
	}
}

func BenchmarkPublishWithMultipleSubscribers(b *testing.B) {
	bus := NewEventBus()
	bus.Start()
	defer bus.Stop()

	// Create 10 subscribers
	for i := 0; i < 10; i++ {
		ch := bus.SubscribeCandles()
		go func(ch <-chan *CandleEvent) {
			for range ch {
				// Discard
			}
		}(ch)
	}

	event := &CandleEvent{
		Symbol:   "BTCUSDT",
		Interval: "5m",
		OpenTime: time.Now(),
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		bus.PublishCandleEvent(event)
	}
}
