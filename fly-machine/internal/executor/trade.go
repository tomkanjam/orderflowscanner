package executor

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"github.com/yourusername/trader-machine/internal/binance"
	"github.com/yourusername/trader-machine/internal/database"
	"github.com/yourusername/trader-machine/internal/types"
)

// TradeExecutor handles all trade operations
type TradeExecutor struct {
	binanceClient *binance.Client
	db            *database.Client
	paperMode     bool
	paperBalance  map[string]float64
	mu            sync.RWMutex
}

// NewTradeExecutor creates a new trade executor
func NewTradeExecutor(binanceClient *binance.Client, db *database.Client, paperMode bool) *TradeExecutor {
	return &TradeExecutor{
		binanceClient: binanceClient,
		db:            db,
		paperMode:     paperMode,
		paperBalance:  map[string]float64{"USDT": 10000}, // Start with $10k paper money
	}
}

// ExecuteTrade executes a trade based on the decision
func (te *TradeExecutor) ExecuteTrade(ctx context.Context, signal *types.Signal, position *types.Position, decision *types.Decision) error {
	switch decision.Decision {
	case "open_long":
		return te.openLong(ctx, signal, decision)
	case "open_short":
		return te.openShort(ctx, signal, decision)
	case "close":
		return te.closePosition(ctx, position, decision)
	case "partial_close":
		return te.partialClose(ctx, position, decision)
	case "scale_in":
		return te.scaleIn(ctx, position, decision)
	case "scale_out":
		return te.scaleOut(ctx, position, decision)
	case "flip_position":
		return te.flipPosition(ctx, position, decision)
	default:
		return fmt.Errorf("unknown decision: %s", decision.Decision)
	}
}

// openLong opens a long position
func (te *TradeExecutor) openLong(ctx context.Context, signal *types.Signal, decision *types.Decision) error {
	positionSize := te.calculatePositionSize(signal, decision)

	// Get current price from signal
	currentPrice := signal.TriggerPrice

	var trade *types.Trade
	var err error

	if te.paperMode {
		trade, err = te.executePaperTrade(ctx, signal.UserID, signal.Symbol, "BUY", positionSize, currentPrice)
	} else {
		trade, err = te.executeRealTrade(ctx, signal.UserID, signal.Symbol, "BUY", positionSize)
	}

	if err != nil {
		return err
	}

	// Create position
	position := &types.Position{
		ID:         uuid.New().String(),
		SignalID:   signal.ID,
		UserID:     signal.UserID,
		Symbol:     signal.Symbol,
		Side:       "long",
		EntryPrice: trade.Price,
		Size:       trade.Quantity,
		StopLoss:   getFloat(decision.Metadata, "stopLoss"),
		TakeProfit: getFloat(decision.Metadata, "takeProfit"),
		Status:     "open",
		OpenedAt:   time.Now(),
	}

	// Create stop-loss and take-profit orders if specified
	if position.StopLoss > 0 && !te.paperMode {
		slOrder, _ := te.binanceClient.NewStopLossOrder(signal.Symbol, "SELL", position.Size, position.StopLoss)
		if slOrder != nil {
			position.StopLossOrderID = slOrder.OrderID
		}
	}

	if position.TakeProfit > 0 && !te.paperMode {
		tpOrder, _ := te.binanceClient.NewLimitOrder(signal.Symbol, "SELL", position.Size, position.TakeProfit)
		if tpOrder != nil {
			position.TakeProfitOrderID = tpOrder.OrderID
		}
	}

	// Save position to database
	if err := te.db.CreatePosition(ctx, position); err != nil {
		return fmt.Errorf("failed to save position: %w", err)
	}

	// Update signal status
	if err := te.db.UpdateSignal(ctx, signal.ID, "position_open", currentPrice); err != nil {
		return fmt.Errorf("failed to update signal: %w", err)
	}

	trade.PositionID = position.ID
	if err := te.db.CreateTrade(ctx, trade); err != nil {
		return fmt.Errorf("failed to save trade: %w", err)
	}

	log.Info().
		Str("position_id", position.ID).
		Str("symbol", signal.Symbol).
		Float64("entry_price", position.EntryPrice).
		Float64("size", position.Size).
		Msg("Long position opened")

	return nil
}

// openShort opens a short position (similar to openLong but SELL side)
func (te *TradeExecutor) openShort(ctx context.Context, signal *types.Signal, decision *types.Decision) error {
	positionSize := te.calculatePositionSize(signal, decision)
	currentPrice := signal.TriggerPrice

	var trade *types.Trade
	var err error

	if te.paperMode {
		trade, err = te.executePaperTrade(ctx, signal.UserID, signal.Symbol, "SELL", positionSize, currentPrice)
	} else {
		trade, err = te.executeRealTrade(ctx, signal.UserID, signal.Symbol, "SELL", positionSize)
	}

	if err != nil {
		return err
	}

	position := &types.Position{
		ID:         uuid.New().String(),
		SignalID:   signal.ID,
		UserID:     signal.UserID,
		Symbol:     signal.Symbol,
		Side:       "short",
		EntryPrice: trade.Price,
		Size:       trade.Quantity,
		StopLoss:   getFloat(decision.Metadata, "stopLoss"),
		TakeProfit: getFloat(decision.Metadata, "takeProfit"),
		Status:     "open",
		OpenedAt:   time.Now(),
	}

	// Stop-loss and take-profit for short (opposite directions)
	if position.StopLoss > 0 && !te.paperMode {
		slOrder, _ := te.binanceClient.NewStopLossOrder(signal.Symbol, "BUY", position.Size, position.StopLoss)
		if slOrder != nil {
			position.StopLossOrderID = slOrder.OrderID
		}
	}

	if position.TakeProfit > 0 && !te.paperMode {
		tpOrder, _ := te.binanceClient.NewLimitOrder(signal.Symbol, "BUY", position.Size, position.TakeProfit)
		if tpOrder != nil {
			position.TakeProfitOrderID = tpOrder.OrderID
		}
	}

	if err := te.db.CreatePosition(ctx, position); err != nil {
		return fmt.Errorf("failed to save position: %w", err)
	}

	if err := te.db.UpdateSignal(ctx, signal.ID, "position_open", currentPrice); err != nil {
		return fmt.Errorf("failed to update signal: %w", err)
	}

	trade.PositionID = position.ID
	if err := te.db.CreateTrade(ctx, trade); err != nil {
		return fmt.Errorf("failed to save trade: %w", err)
	}

	log.Info().
		Str("position_id", position.ID).
		Str("symbol", signal.Symbol).
		Float64("entry_price", position.EntryPrice).
		Msg("Short position opened")

	return nil
}

// closePosition closes a position completely
func (te *TradeExecutor) closePosition(ctx context.Context, position *types.Position, decision *types.Decision) error {
	side := "SELL"
	if position.Side == "short" {
		side = "BUY"
	}

	var trade *types.Trade
	var err error

	if te.paperMode {
		trade, err = te.executePaperTrade(ctx, position.UserID, position.Symbol, side, position.Size, 0)
	} else {
		trade, err = te.executeRealTrade(ctx, position.UserID, position.Symbol, side, position.Size)
	}

	if err != nil {
		return err
	}

	// Calculate PNL
	pnl, pnlPercent := te.calculatePNL(position, trade.Price)

	// Close position in database
	if err := te.db.ClosePosition(ctx, position.ID, trade.Price, pnl, pnlPercent, "manual_close"); err != nil {
		return fmt.Errorf("failed to close position: %w", err)
	}

	// Save trade
	trade.PositionID = position.ID
	if err := te.db.CreateTrade(ctx, trade); err != nil {
		return fmt.Errorf("failed to save trade: %w", err)
	}

	log.Info().
		Str("position_id", position.ID).
		Float64("pnl", pnl).
		Float64("pnl_percent", pnlPercent).
		Msg("Position closed")

	return nil
}

// partialClose closes a portion of the position
func (te *TradeExecutor) partialClose(ctx context.Context, position *types.Position, decision *types.Decision) error {
	percentage := getFloat(decision.Metadata, "closePercentage")
	if percentage == 0 {
		percentage = 0.5 // Default 50%
	}

	closeSize := position.Size * percentage
	side := "SELL"
	if position.Side == "short" {
		side = "BUY"
	}

	var trade *types.Trade
	var err error

	if te.paperMode {
		trade, err = te.executePaperTrade(ctx, position.UserID, position.Symbol, side, closeSize, 0)
	} else {
		trade, err = te.executeRealTrade(ctx, position.UserID, position.Symbol, side, closeSize)
	}

	if err != nil {
		return err
	}

	// Update position size
	position.Size -= closeSize
	if err := te.db.UpdatePosition(ctx, position); err != nil {
		return err
	}

	// Save trade
	trade.PositionID = position.ID
	if err := te.db.CreateTrade(ctx, trade); err != nil {
		return err
	}

	log.Info().
		Str("position_id", position.ID).
		Float64("close_size", closeSize).
		Float64("remaining_size", position.Size).
		Msg("Partial close executed")

	return nil
}

// scaleIn adds to an existing position
func (te *TradeExecutor) scaleIn(ctx context.Context, position *types.Position, decision *types.Decision) error {
	addSize := getFloat(decision.Metadata, "scaleInAmount")

	side := "BUY"
	if position.Side == "short" {
		side = "SELL"
	}

	var trade *types.Trade
	var err error

	if te.paperMode {
		trade, err = te.executePaperTrade(ctx, position.UserID, position.Symbol, side, addSize, 0)
	} else {
		trade, err = te.executeRealTrade(ctx, position.UserID, position.Symbol, side, addSize)
	}

	if err != nil {
		return err
	}

	// Update position with new average entry
	totalCost := (position.EntryPrice * position.Size) + (trade.Price * addSize)
	newSize := position.Size + addSize
	position.EntryPrice = totalCost / newSize
	position.Size = newSize

	if err := te.db.UpdatePosition(ctx, position); err != nil {
		return err
	}

	trade.PositionID = position.ID
	if err := te.db.CreateTrade(ctx, trade); err != nil {
		return err
	}

	log.Info().
		Str("position_id", position.ID).
		Float64("add_size", addSize).
		Float64("new_avg_entry", position.EntryPrice).
		Msg("Scaled into position")

	return nil
}

// scaleOut reduces position gradually
func (te *TradeExecutor) scaleOut(ctx context.Context, position *types.Position, decision *types.Decision) error {
	percentage := getFloat(decision.Metadata, "scaleOutPercentage")
	if percentage == 0 {
		percentage = 0.25 // Default 25%
	}

	return te.partialClose(ctx, position, decision)
}

// flipPosition closes current position and opens opposite
func (te *TradeExecutor) flipPosition(ctx context.Context, position *types.Position, decision *types.Decision) error {
	// Close current position
	if err := te.closePosition(ctx, position, decision); err != nil {
		return err
	}

	// Open opposite position
	signal := &types.Signal{
		ID:           uuid.New().String(),
		TraderID:     position.SignalID, // Use same trader
		UserID:       position.UserID,
		Symbol:       position.Symbol,
		Timestamp:    time.Now(),
		Status:       "new",
		TriggerPrice: position.ExitPrice,
	}

	if position.Side == "long" {
		return te.openShort(ctx, signal, decision)
	}
	return te.openLong(ctx, signal, decision)
}

// UpdateStopLoss updates the stop-loss for a position
func (te *TradeExecutor) UpdateStopLoss(ctx context.Context, position *types.Position, newStopLoss float64) error {
	// Cancel old order if exists
	if position.StopLossOrderID != 0 && !te.paperMode {
		_ = te.binanceClient.CancelOrder(position.Symbol, position.StopLossOrderID)
	}

	// Place new order
	if !te.paperMode {
		side := "SELL"
		if position.Side == "short" {
			side = "BUY"
		}

		order, err := te.binanceClient.NewStopLossOrder(position.Symbol, side, position.Size, newStopLoss)
		if err != nil {
			return err
		}
		position.StopLossOrderID = order.OrderID
	}

	position.StopLoss = newStopLoss
	return te.db.UpdatePosition(ctx, position)
}

// UpdateTakeProfit updates the take-profit for a position
func (te *TradeExecutor) UpdateTakeProfit(ctx context.Context, position *types.Position, newTakeProfit float64) error {
	// Cancel old order if exists
	if position.TakeProfitOrderID != 0 && !te.paperMode {
		_ = te.binanceClient.CancelOrder(position.Symbol, position.TakeProfitOrderID)
	}

	// Place new order
	if !te.paperMode {
		side := "SELL"
		if position.Side == "short" {
			side = "BUY"
		}

		order, err := te.binanceClient.NewLimitOrder(position.Symbol, side, position.Size, newTakeProfit)
		if err != nil {
			return err
		}
		position.TakeProfitOrderID = order.OrderID
	}

	position.TakeProfit = newTakeProfit
	return te.db.UpdatePosition(ctx, position)
}

// Helper functions

func (te *TradeExecutor) calculatePositionSize(signal *types.Signal, decision *types.Decision) float64 {
	size := getFloat(decision.Metadata, "positionSize")
	if size == 0 {
		size = 0.001 // Default minimum size
	}
	return size
}

func (te *TradeExecutor) calculatePNL(position *types.Position, exitPrice float64) (pnl, pnlPercent float64) {
	if position.Side == "long" {
		pnl = (exitPrice - position.EntryPrice) * position.Size
	} else {
		pnl = (position.EntryPrice - exitPrice) * position.Size
	}

	pnlPercent = (pnl / (position.EntryPrice * position.Size)) * 100
	return pnl, pnlPercent
}

func (te *TradeExecutor) executeRealTrade(ctx context.Context, userID, symbol, side string, quantity float64) (*types.Trade, error) {
	order, err := te.binanceClient.NewOrder(symbol, side, "MARKET", quantity)
	if err != nil {
		trade := &types.Trade{
			ID:           uuid.New().String(),
			UserID:       userID,
			Type:         "real",
			Side:         side,
			Symbol:       symbol,
			Quantity:     quantity,
			Status:       "failed",
			ErrorMessage: err.Error(),
			ExecutedAt:   time.Now(),
		}
		return trade, err
	}

	price := 0.0
	fmt.Sscanf(order.Price, "%f", &price)

	trade := &types.Trade{
		ID:             uuid.New().String(),
		UserID:         userID,
		Type:           "real",
		Side:           side,
		Symbol:         symbol,
		Price:          price,
		Quantity:       quantity,
		Status:         "filled",
		BinanceOrderID: order.OrderID,
		ExecutedAt:     time.Now(),
	}

	return trade, nil
}

func (te *TradeExecutor) executePaperTrade(ctx context.Context, userID, symbol, side string, quantity, price float64) (*types.Trade, error) {
	te.mu.Lock()
	defer te.mu.Unlock()

	// Use current price if not provided
	if price == 0 {
		price = 50000 // Would get from ticker in real implementation
	}

	// Simulate trade
	if side == "BUY" {
		cost := price * quantity
		if te.paperBalance["USDT"] < cost {
			return nil, fmt.Errorf("insufficient paper balance")
		}
		te.paperBalance["USDT"] -= cost
	} else {
		te.paperBalance["USDT"] += price * quantity
	}

	trade := &types.Trade{
		ID:         uuid.New().String(),
		UserID:     userID,
		Type:       "paper",
		Side:       side,
		Symbol:     symbol,
		Price:      price,
		Quantity:   quantity,
		Status:     "filled",
		ExecutedAt: time.Now(),
	}

	return trade, nil
}

func getFloat(m map[string]interface{}, key string) float64 {
	if m == nil {
		return 0
	}
	if val, ok := m[key]; ok {
		switch v := val.(type) {
		case float64:
			return v
		case int:
			return float64(v)
		}
	}
	return 0
}
