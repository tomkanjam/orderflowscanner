package events

import (
	"github.com/asaskevich/EventBus"
	"github.com/rs/zerolog/log"
	"github.com/yourusername/trader-machine/internal/types"
)

const (
	// Event types
	SignalTriggered     = "signal.triggered"
	AnalysisCompleted   = "analysis.completed"
	PositionOpened      = "position.opened"
	PositionClosed      = "position.closed"
	TradeExecuted       = "trade.executed"
	ErrorOccurred       = "error.occurred"
)

// Bus wraps EventBus for type-safe events
type Bus struct {
	bus EventBus.Bus
}

// New creates a new event bus
func New() *Bus {
	return &Bus{
		bus: EventBus.New(),
	}
}

// PublishSignalTriggered publishes a signal triggered event
func (b *Bus) PublishSignalTriggered(signal *types.Signal) {
	log.Debug().
		Str("signal_id", signal.ID).
		Str("symbol", signal.Symbol).
		Msg("Publishing signal.triggered event")

	b.bus.Publish(SignalTriggered, signal)
}

// SubscribeSignalTriggered subscribes to signal triggered events
func (b *Bus) SubscribeSignalTriggered(fn func(*types.Signal)) error {
	return b.bus.Subscribe(SignalTriggered, fn)
}

// PublishAnalysisCompleted publishes an analysis completed event
func (b *Bus) PublishAnalysisCompleted(signal *types.Signal, decision *types.Decision) {
	log.Debug().
		Str("signal_id", signal.ID).
		Str("decision", decision.Decision).
		Msg("Publishing analysis.completed event")

	b.bus.Publish(AnalysisCompleted, signal, decision)
}

// SubscribeAnalysisCompleted subscribes to analysis completed events
func (b *Bus) SubscribeAnalysisCompleted(fn func(*types.Signal, *types.Decision)) error {
	return b.bus.Subscribe(AnalysisCompleted, fn)
}

// PublishPositionOpened publishes a position opened event
func (b *Bus) PublishPositionOpened(position *types.Position) {
	log.Debug().
		Str("position_id", position.ID).
		Str("symbol", position.Symbol).
		Str("side", position.Side).
		Msg("Publishing position.opened event")

	b.bus.Publish(PositionOpened, position)
}

// SubscribePositionOpened subscribes to position opened events
func (b *Bus) SubscribePositionOpened(fn func(*types.Position)) error {
	return b.bus.Subscribe(PositionOpened, fn)
}

// PublishPositionClosed publishes a position closed event
func (b *Bus) PublishPositionClosed(position *types.Position) {
	log.Debug().
		Str("position_id", position.ID).
		Float64("pnl", position.PNL).
		Msg("Publishing position.closed event")

	b.bus.Publish(PositionClosed, position)
}

// SubscribePositionClosed subscribes to position closed events
func (b *Bus) SubscribePositionClosed(fn func(*types.Position)) error {
	return b.bus.Subscribe(PositionClosed, fn)
}

// PublishTradeExecuted publishes a trade executed event
func (b *Bus) PublishTradeExecuted(trade *types.Trade) {
	log.Debug().
		Str("trade_id", trade.ID).
		Str("symbol", trade.Symbol).
		Str("side", trade.Side).
		Msg("Publishing trade.executed event")

	b.bus.Publish(TradeExecuted, trade)
}

// SubscribeTradeExecuted subscribes to trade executed events
func (b *Bus) SubscribeTradeExecuted(fn func(*types.Trade)) error {
	return b.bus.Subscribe(TradeExecuted, fn)
}

// PublishError publishes an error event
func (b *Bus) PublishError(component, message string, err error) {
	log.Error().
		Str("component", component).
		Str("message", message).
		Err(err).
		Msg("Publishing error event")

	b.bus.Publish(ErrorOccurred, component, message, err)
}

// SubscribeError subscribes to error events
func (b *Bus) SubscribeError(fn func(string, string, error)) error {
	return b.bus.Subscribe(ErrorOccurred, fn)
}

// Unsubscribe removes all subscriptions for a topic
func (b *Bus) Unsubscribe(topic string, handler interface{}) error {
	return b.bus.Unsubscribe(topic, handler)
}

// WaitAsync waits for all async event handlers to complete
func (b *Bus) WaitAsync() {
	b.bus.WaitAsync()
}
