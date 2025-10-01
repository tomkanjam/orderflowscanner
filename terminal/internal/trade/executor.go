package trade

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/adshao/go-binance/v2"
	"github.com/rs/zerolog/log"
	"github.com/yourusername/aitrader-tui/internal/errors"
	"github.com/yourusername/aitrader-tui/internal/helpers"
	"github.com/yourusername/aitrader-tui/internal/storage"
	"github.com/yourusername/aitrader-tui/internal/types"
)

// Executor handles trade execution (paper trading and real trading)
type Executor struct {
	mu sync.RWMutex

	// Configuration
	paperTradingOnly bool
	apiKey           string
	secretKey        string

	// Binance client
	binanceClient *binance.Client

	// Storage
	storage storage.Storage

	// Paper trading state
	paperBalances map[string]*types.Balance // userID -> balance

	// State
	ctx     context.Context
	cancel  context.CancelFunc
	running bool
}

// NewExecutor creates a new trade executor
func NewExecutor(storage storage.Storage, paperTradingOnly bool, apiKey, secretKey string) *Executor {
	ctx, cancel := context.WithCancel(context.Background())

	e := &Executor{
		ctx:              ctx,
		cancel:           cancel,
		paperTradingOnly: paperTradingOnly,
		apiKey:           apiKey,
		secretKey:        secretKey,
		storage:          storage,
		paperBalances:    make(map[string]*types.Balance),
		running:          false,
	}

	// Initialize Binance client for real trading
	if !paperTradingOnly && apiKey != "" && secretKey != "" {
		e.binanceClient = binance.NewClient(apiKey, secretKey)
		log.Info().Msg("Binance client initialized for real trading")
	}

	return e
}

// Start starts the trade executor
func (e *Executor) Start() error {
	e.mu.Lock()
	if e.running {
		e.mu.Unlock()
		return nil
	}
	e.running = true
	e.mu.Unlock()

	log.Info().Bool("paper_trading", e.paperTradingOnly).Msg("Trade executor started")

	return nil
}

// Stop stops the trade executor
func (e *Executor) Stop() error {
	e.mu.Lock()
	if !e.running {
		e.mu.Unlock()
		return nil
	}
	e.running = false
	e.mu.Unlock()

	log.Info().Msg("Trade executor stopped")

	e.cancel()

	return nil
}

// ExecuteEntry executes an entry order for a signal
func (e *Executor) ExecuteEntry(signal *types.Signal, quantity float64, currentPrice float64) (*types.Position, error) {
	if !e.running {
		return nil, errors.ErrEngineNotRunning
	}

	log.Info().
		Str("signal_id", signal.ID).
		Str("symbol", signal.Symbol).
		Float64("quantity", quantity).
		Float64("price", currentPrice).
		Msg("Executing entry order")

	// Determine side (for now, assume LONG)
	side := types.PositionSideLong

	// Create position
	position := &types.Position{
		ID:            helpers.GenerateID("pos", 16),
		SignalID:      signal.ID,
		TraderID:      signal.TraderID,
		UserID:        signal.UserID,
		Symbol:        signal.Symbol,
		Side:          side,
		Status:        types.PositionStatusOpen,
		EntryPrice:    currentPrice,
		Quantity:      quantity,
		StopLoss:      signal.StopLoss,
		TakeProfit:    signal.TakeProfit,
		CurrentPrice:  currentPrice,
		UnrealizedPnL: 0,
		IsPaperTrade:  e.paperTradingOnly,
		EnteredAt:     time.Now(),
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	// Execute order
	if e.paperTradingOnly {
		// Paper trading
		if err := e.executePaperEntry(position); err != nil {
			return nil, err
		}
	} else {
		// Real trading
		if err := e.executeRealEntry(position); err != nil {
			return nil, err
		}
	}

	// Save position to storage
	storagePos := convertToStoragePosition(position)
	if err := e.storage.CreatePosition(context.Background(), storagePos); err != nil {
		log.Error().Err(err).Str("position_id", position.ID).Msg("Failed to save position")
		return nil, err
	}

	log.Info().
		Str("position_id", position.ID).
		Str("signal_id", signal.ID).
		Float64("entry_price", position.EntryPrice).
		Msg("Entry order executed")

	return position, nil
}

// ExecuteExit executes an exit order for a position
func (e *Executor) ExecuteExit(position *types.Position, exitReason string, currentPrice float64) error {
	if !e.running {
		return errors.ErrEngineNotRunning
	}

	log.Info().
		Str("position_id", position.ID).
		Str("reason", exitReason).
		Float64("price", currentPrice).
		Msg("Executing exit order")

	// Update position
	position.Status = types.PositionStatusClosed
	position.ExitPrice = currentPrice
	position.CurrentPrice = currentPrice

	// Calculate final PnL
	isLong := position.Side == types.PositionSideLong
	position.RealizedPnL = helpers.CalculatePnL(position.EntryPrice, currentPrice, position.Quantity, isLong)
	position.PnLPercent = helpers.CalculatePnLPercent(position.EntryPrice, currentPrice, isLong)

	now := time.Now()
	position.ClosedAt = &now
	position.UpdatedAt = now

	// Execute order
	if e.paperTradingOnly {
		// Paper trading
		if err := e.executePaperExit(position); err != nil {
			return err
		}
	} else {
		// Real trading
		if err := e.executeRealExit(position); err != nil {
			return err
		}
	}

	// Update position in storage
	storagePos := convertToStoragePosition(position)
	if err := e.storage.UpdatePosition(context.Background(), storagePos); err != nil {
		log.Error().Err(err).Str("position_id", position.ID).Msg("Failed to update position")
		return err
	}

	log.Info().
		Str("position_id", position.ID).
		Float64("exit_price", position.ExitPrice).
		Float64("pnl", position.RealizedPnL).
		Float64("pnl_pct", position.PnLPercent).
		Msg("Exit order executed")

	return nil
}

// executePaperEntry executes a paper trading entry
func (e *Executor) executePaperEntry(position *types.Position) error {
	// Get or create paper balance
	balance := e.getPaperBalance(position.UserID)

	// Calculate required funds
	requiredFunds := position.EntryPrice * position.Quantity

	// Check if sufficient balance
	if balance.Free < requiredFunds {
		return errors.ErrInsufficientBalance
	}

	// Update balance
	balance.Free -= requiredFunds
	balance.Locked += requiredFunds
	balance.UpdatedAt = time.Now()

	e.mu.Lock()
	e.paperBalances[position.UserID] = balance
	e.mu.Unlock()

	log.Info().
		Str("user_id", position.UserID).
		Float64("required", requiredFunds).
		Float64("remaining", balance.Free).
		Msg("Paper entry executed")

	return nil
}

// executePaperExit executes a paper trading exit
func (e *Executor) executePaperExit(position *types.Position) error {
	// Get paper balance
	balance := e.getPaperBalance(position.UserID)

	// Calculate funds to release
	lockedFunds := position.EntryPrice * position.Quantity
	returnFunds := (position.EntryPrice + position.RealizedPnL/position.Quantity) * position.Quantity

	// Update balance
	balance.Locked -= lockedFunds
	balance.Free += returnFunds
	balance.UpdatedAt = time.Now()

	e.mu.Lock()
	e.paperBalances[position.UserID] = balance
	e.mu.Unlock()

	log.Info().
		Str("user_id", position.UserID).
		Float64("pnl", position.RealizedPnL).
		Float64("balance", balance.Free).
		Msg("Paper exit executed")

	return nil
}

// executeRealEntry executes a real trading entry
func (e *Executor) executeRealEntry(position *types.Position) error {
	if e.binanceClient == nil {
		return fmt.Errorf("binance client not initialized")
	}

	// Create market order
	orderSide := binance.SideTypeBuy
	if position.Side == types.PositionSideShort {
		orderSide = binance.SideTypeSell
	}

	order, err := e.binanceClient.NewCreateOrderService().
		Symbol(position.Symbol).
		Side(orderSide).
		Type(binance.OrderTypeMarket).
		Quantity(fmt.Sprintf("%.8f", position.Quantity)).
		Do(context.Background())

	if err != nil {
		return errors.NewPositionError(position.ID, "create_order", err)
	}

	// Store order ID
	position.OrderID = fmt.Sprintf("%d", order.OrderID)

	log.Info().
		Str("position_id", position.ID).
		Str("order_id", position.OrderID).
		Msg("Real entry order created")

	return nil
}

// executeRealExit executes a real trading exit
func (e *Executor) executeRealExit(position *types.Position) error {
	if e.binanceClient == nil {
		return fmt.Errorf("binance client not initialized")
	}

	// Create market order (opposite side)
	orderSide := binance.SideTypeSell
	if position.Side == types.PositionSideShort {
		orderSide = binance.SideTypeBuy
	}

	order, err := e.binanceClient.NewCreateOrderService().
		Symbol(position.Symbol).
		Side(orderSide).
		Type(binance.OrderTypeMarket).
		Quantity(fmt.Sprintf("%.8f", position.Quantity)).
		Do(context.Background())

	if err != nil {
		return errors.NewPositionError(position.ID, "close_order", err)
	}

	log.Info().
		Str("position_id", position.ID).
		Str("order_id", fmt.Sprintf("%d", order.OrderID)).
		Msg("Real exit order created")

	return nil
}

// getPaperBalance gets or creates a paper trading balance
func (e *Executor) getPaperBalance(userID string) *types.Balance {
	e.mu.RLock()
	balance, exists := e.paperBalances[userID]
	e.mu.RUnlock()

	if exists {
		return balance
	}

	// Create initial balance
	balance = &types.Balance{
		UserID:       userID,
		Asset:        "USDT",
		Free:         10000.0, // $10k starting balance
		Locked:       0,
		Total:        10000.0,
		IsPaperTrade: true,
		UpdatedAt:    time.Now(),
	}

	e.mu.Lock()
	e.paperBalances[userID] = balance
	e.mu.Unlock()

	log.Info().Str("user_id", userID).Float64("balance", balance.Free).Msg("Created paper trading balance")

	return balance
}

// GetPaperBalance returns the paper trading balance for a user
func (e *Executor) GetPaperBalance(userID string) *types.Balance {
	return e.getPaperBalance(userID)
}

// IsPaperTrading returns whether the executor is in paper trading mode
func (e *Executor) IsPaperTrading() bool {
	return e.paperTradingOnly
}

// convertToStoragePosition converts types.Position to storage.Position
func convertToStoragePosition(p *types.Position) *storage.Position {
	return &storage.Position{
		ID:           p.ID,
		UserID:       p.UserID,
		TraderID:     p.TraderID,
		SignalID:     p.SignalID,
		Symbol:       p.Symbol,
		Side:         string(p.Side),
		EntryPrice:   p.EntryPrice,
		CurrentPrice: p.CurrentPrice,
		Size:         p.Quantity,
		StopLoss:     p.StopLoss,
		TakeProfit:   p.TakeProfit,
		PNL:          p.UnrealizedPnL,
		PNLPct:       p.PnLPercent,
		Status:       string(p.Status),
		CreatedAt:    p.CreatedAt,
		UpdatedAt:    p.UpdatedAt,
		ClosedAt:     p.ClosedAt,
	}
}
