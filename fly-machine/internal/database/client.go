package database

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
	"github.com/yourusername/trader-machine/internal/types"
)

// Client manages database operations
type Client struct {
	pool *pgxpool.Pool
}

// New creates a new database client
func New(databaseURL string) (*Client, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database URL: %w", err)
	}

	// Configure connection pool
	config.MaxConns = 10
	config.MinConns = 2
	config.MaxConnLifetime = time.Hour
	config.MaxConnIdleTime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Test connection
	if err := pool.Ping(context.Background()); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	log.Info().Msg("Database client initialized")

	return &Client{pool: pool}, nil
}

// Close closes the database connection pool
func (c *Client) Close() {
	c.pool.Close()
	log.Info().Msg("Database client closed")
}

// Traders

// GetActiveTraders retrieves all active traders for a user
func (c *Client) GetActiveTraders(ctx context.Context, userID string) ([]types.Trader, error) {
	query := `
		SELECT id, user_id, name, description, signal_code, ai_instructions,
		       timeframes, check_interval, reanalysis_interval, symbols,
		       status, error_message, created_at, updated_at
		FROM traders
		WHERE user_id = $1 AND status = 'active'
		ORDER BY created_at DESC
	`

	rows, err := c.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query traders: %w", err)
	}
	defer rows.Close()

	var traders []types.Trader
	for rows.Next() {
		var t types.Trader
		err := rows.Scan(
			&t.ID, &t.UserID, &t.Name, &t.Description, &t.SignalCode,
			&t.AIInstructions, &t.Timeframes, &t.CheckInterval,
			&t.ReanalysisInterval, &t.Symbols, &t.Status, &t.ErrorMessage,
			&t.CreatedAt, &t.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan trader: %w", err)
		}
		traders = append(traders, t)
	}

	return traders, nil
}

// UpdateTraderStatus updates the status of a trader
func (c *Client) UpdateTraderStatus(ctx context.Context, traderID, status string) error {
	query := `UPDATE traders SET status = $1, updated_at = NOW() WHERE id = $2`
	_, err := c.pool.Exec(ctx, query, status, traderID)
	return err
}

// UpdateTraderError updates the error message of a trader
func (c *Client) UpdateTraderError(ctx context.Context, traderID, errorMsg string) error {
	query := `UPDATE traders SET error_message = $1, status = 'error', updated_at = NOW() WHERE id = $2`
	_, err := c.pool.Exec(ctx, query, errorMsg, traderID)
	return err
}

// Signals

// CreateSignal creates a new signal
func (c *Client) CreateSignal(ctx context.Context, signal *types.Signal) error {
	query := `
		INSERT INTO signals (id, trader_id, user_id, symbol, timestamp, status, trigger_price, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
	`
	_, err := c.pool.Exec(ctx, query,
		signal.ID, signal.TraderID, signal.UserID, signal.Symbol,
		signal.Timestamp, signal.Status, signal.TriggerPrice,
	)
	return err
}

// UpdateSignal updates a signal's status and current price
func (c *Client) UpdateSignal(ctx context.Context, signalID, status string, currentPrice float64) error {
	query := `UPDATE signals SET status = $1, current_price = $2, updated_at = NOW() WHERE id = $3`
	_, err := c.pool.Exec(ctx, query, status, currentPrice, signalID)
	return err
}

// CloseSignal marks a signal as closed
func (c *Client) CloseSignal(ctx context.Context, signalID, reason string) error {
	query := `
		UPDATE signals
		SET status = 'closed', close_reason = $1, closed_at = NOW(), updated_at = NOW()
		WHERE id = $2
	`
	_, err := c.pool.Exec(ctx, query, reason, signalID)
	return err
}

// GetWatchingSignals retrieves all signals with status 'watching' or 'position_open'
func (c *Client) GetWatchingSignals(ctx context.Context, traderID string) ([]types.Signal, error) {
	query := `
		SELECT id, trader_id, user_id, symbol, timestamp, status,
		       trigger_price, current_price, created_at, updated_at
		FROM signals
		WHERE trader_id = $1 AND status IN ('watching', 'position_open')
		ORDER BY timestamp DESC
	`

	rows, err := c.pool.Query(ctx, query, traderID)
	if err != nil {
		return nil, fmt.Errorf("failed to query signals: %w", err)
	}
	defer rows.Close()

	var signals []types.Signal
	for rows.Next() {
		var s types.Signal
		err := rows.Scan(
			&s.ID, &s.TraderID, &s.UserID, &s.Symbol, &s.Timestamp,
			&s.Status, &s.TriggerPrice, &s.CurrentPrice, &s.CreatedAt, &s.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan signal: %w", err)
		}
		signals = append(signals, s)
	}

	return signals, nil
}

// Positions

// CreatePosition creates a new position
func (c *Client) CreatePosition(ctx context.Context, pos *types.Position) error {
	query := `
		INSERT INTO positions (
			id, signal_id, user_id, symbol, side, entry_price, size,
			stop_loss, stop_loss_order_id, take_profit, take_profit_order_id,
			status, opened_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`
	_, err := c.pool.Exec(ctx, query,
		pos.ID, pos.SignalID, pos.UserID, pos.Symbol, pos.Side,
		pos.EntryPrice, pos.Size, pos.StopLoss, pos.StopLossOrderID,
		pos.TakeProfit, pos.TakeProfitOrderID, pos.Status, pos.OpenedAt,
	)
	return err
}

// UpdatePosition updates a position
func (c *Client) UpdatePosition(ctx context.Context, pos *types.Position) error {
	query := `
		UPDATE positions
		SET stop_loss = $1, stop_loss_order_id = $2, take_profit = $3,
		    take_profit_order_id = $4, size = $5
		WHERE id = $6
	`
	_, err := c.pool.Exec(ctx, query,
		pos.StopLoss, pos.StopLossOrderID, pos.TakeProfit,
		pos.TakeProfitOrderID, pos.Size, pos.ID,
	)
	return err
}

// ClosePosition marks a position as closed
func (c *Client) ClosePosition(ctx context.Context, positionID string, exitPrice, pnl, pnlPercent float64, reason string) error {
	query := `
		UPDATE positions
		SET status = 'closed', exit_price = $1, pnl = $2, pnl_percent = $3,
		    close_reason = $4, closed_at = NOW()
		WHERE id = $5
	`
	_, err := c.pool.Exec(ctx, query, exitPrice, pnl, pnlPercent, reason, positionID)
	return err
}

// GetOpenPositions retrieves all open positions for a user
func (c *Client) GetOpenPositions(ctx context.Context, userID string) ([]types.Position, error) {
	query := `
		SELECT id, signal_id, user_id, symbol, side, entry_price, size,
		       stop_loss, stop_loss_order_id, take_profit, take_profit_order_id,
		       status, opened_at
		FROM positions
		WHERE user_id = $1 AND status = 'open'
		ORDER BY opened_at DESC
	`

	rows, err := c.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query positions: %w", err)
	}
	defer rows.Close()

	var positions []types.Position
	for rows.Next() {
		var p types.Position
		err := rows.Scan(
			&p.ID, &p.SignalID, &p.UserID, &p.Symbol, &p.Side,
			&p.EntryPrice, &p.Size, &p.StopLoss, &p.StopLossOrderID,
			&p.TakeProfit, &p.TakeProfitOrderID, &p.Status, &p.OpenedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan position: %w", err)
		}
		positions = append(positions, p)
	}

	return positions, nil
}

// GetPositionBySignal retrieves a position by signal ID
func (c *Client) GetPositionBySignal(ctx context.Context, signalID string) (*types.Position, error) {
	query := `
		SELECT id, signal_id, user_id, symbol, side, entry_price, size,
		       stop_loss, stop_loss_order_id, take_profit, take_profit_order_id,
		       status, opened_at
		FROM positions
		WHERE signal_id = $1 AND status = 'open'
		LIMIT 1
	`

	var p types.Position
	err := c.pool.QueryRow(ctx, query, signalID).Scan(
		&p.ID, &p.SignalID, &p.UserID, &p.Symbol, &p.Side,
		&p.EntryPrice, &p.Size, &p.StopLoss, &p.StopLossOrderID,
		&p.TakeProfit, &p.TakeProfitOrderID, &p.Status, &p.OpenedAt,
	)
	if err != nil {
		return nil, err
	}

	return &p, nil
}

// Trades

// CreateTrade creates a new trade record
func (c *Client) CreateTrade(ctx context.Context, trade *types.Trade) error {
	query := `
		INSERT INTO trades (
			id, position_id, user_id, type, side, symbol, price, quantity,
			status, binance_order_id, error_message, executed_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`
	_, err := c.pool.Exec(ctx, query,
		trade.ID, trade.PositionID, trade.UserID, trade.Type, trade.Side,
		trade.Symbol, trade.Price, trade.Quantity, trade.Status,
		trade.BinanceOrderID, trade.ErrorMessage, trade.ExecutedAt,
	)
	return err
}

// GetTrades retrieves trades for a position
func (c *Client) GetTrades(ctx context.Context, positionID string) ([]types.Trade, error) {
	query := `
		SELECT id, position_id, user_id, type, side, symbol, price, quantity,
		       status, binance_order_id, error_message, executed_at
		FROM trades
		WHERE position_id = $1
		ORDER BY executed_at DESC
	`

	rows, err := c.pool.Query(ctx, query, positionID)
	if err != nil {
		return nil, fmt.Errorf("failed to query trades: %w", err)
	}
	defer rows.Close()

	var trades []types.Trade
	for rows.Next() {
		var t types.Trade
		err := rows.Scan(
			&t.ID, &t.PositionID, &t.UserID, &t.Type, &t.Side,
			&t.Symbol, &t.Price, &t.Quantity, &t.Status,
			&t.BinanceOrderID, &t.ErrorMessage, &t.ExecutedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan trade: %w", err)
		}
		trades = append(trades, t)
	}

	return trades, nil
}

// GetSignal retrieves a signal by ID
func (c *Client) GetSignal(ctx context.Context, signalID string) (*types.Signal, error) {
	query := `
		SELECT id, trader_id, user_id, symbol, timestamp, status,
		       trigger_price, current_price, created_at, updated_at
		FROM signals
		WHERE id = $1
	`

	var s types.Signal
	err := c.pool.QueryRow(ctx, query, signalID).Scan(
		&s.ID, &s.TraderID, &s.UserID, &s.Symbol, &s.Timestamp,
		&s.Status, &s.TriggerPrice, &s.CurrentPrice, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &s, nil
}

// Analysis History

// CreateAnalysis creates a new analysis history record
func (c *Client) CreateAnalysis(ctx context.Context, signalID, traderID, userID, decision, reasoning string, confidence int, marketData, metadata map[string]interface{}) error {
	query := `
		INSERT INTO analysis_history (
			signal_id, trader_id, user_id, timestamp, decision, reasoning,
			confidence, market_data, metadata
		) VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8)
	`
	_, err := c.pool.Exec(ctx, query,
		signalID, traderID, userID, decision, reasoning,
		confidence, marketData, metadata,
	)
	return err
}

// Heartbeat

// UpdateHeartbeat updates the machine's last heartbeat timestamp
func (c *Client) UpdateHeartbeat(ctx context.Context, machineID string) error {
	query := `UPDATE fly_machines SET last_heartbeat = NOW() WHERE machine_id = $1`
	_, err := c.pool.Exec(ctx, query, machineID)
	return err
}
