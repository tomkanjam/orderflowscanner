package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/rs/zerolog/log"
)

const schema = `
CREATE TABLE IF NOT EXISTS traders (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	name TEXT NOT NULL,
	description TEXT,
	symbols TEXT,
	timeframes TEXT,
	check_interval TEXT,
	signal_code TEXT,
	reanalysis_interval TEXT,
	status TEXT DEFAULT 'active',
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_traders_user_id ON traders(user_id);
CREATE INDEX IF NOT EXISTS idx_traders_status ON traders(status);

CREATE TABLE IF NOT EXISTS signals (
	id TEXT PRIMARY KEY,
	trader_id TEXT NOT NULL,
	symbol TEXT NOT NULL,
	timeframe TEXT,
	signal_type TEXT,
	status TEXT DEFAULT 'pending',
	trigger_price REAL,
	target_price REAL,
	stop_loss REAL,
	confidence INTEGER,
	reasoning TEXT,
	metadata TEXT,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY(trader_id) REFERENCES traders(id)
);

CREATE INDEX IF NOT EXISTS idx_signals_trader_id ON signals(trader_id);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);

CREATE TABLE IF NOT EXISTS positions (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	trader_id TEXT NOT NULL,
	signal_id TEXT,
	symbol TEXT NOT NULL,
	side TEXT NOT NULL,
	entry_price REAL NOT NULL,
	current_price REAL,
	size REAL NOT NULL,
	stop_loss REAL,
	take_profit REAL,
	pnl REAL DEFAULT 0,
	pnl_pct REAL DEFAULT 0,
	status TEXT DEFAULT 'open',
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	closed_at DATETIME,
	FOREIGN KEY(trader_id) REFERENCES traders(id)
);

CREATE INDEX IF NOT EXISTS idx_positions_user_id ON positions(user_id);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
CREATE INDEX IF NOT EXISTS idx_positions_trader_id ON positions(trader_id);

CREATE TABLE IF NOT EXISTS heartbeats (
	machine_id TEXT PRIMARY KEY,
	last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
);
`

// SQLiteStorage implements Storage interface using SQLite
type SQLiteStorage struct {
	db *sql.DB
}

// NewSQLiteStorage creates a new SQLite storage
func NewSQLiteStorage(dbPath string) (*SQLiteStorage, error) {
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Enable foreign keys
	if _, err := db.Exec("PRAGMA foreign_keys = ON"); err != nil {
		return nil, fmt.Errorf("failed to enable foreign keys: %w", err)
	}

	// Create schema
	if _, err := db.Exec(schema); err != nil {
		return nil, fmt.Errorf("failed to create schema: %w", err)
	}

	log.Info().Str("path", dbPath).Msg("SQLite storage initialized")

	return &SQLiteStorage{db: db}, nil
}

// GetActiveTraders gets all active traders for a user
func (s *SQLiteStorage) GetActiveTraders(ctx context.Context, userID string) ([]Trader, error) {
	query := `SELECT id, user_id, name, description, symbols, timeframes, check_interval,
	          signal_code, reanalysis_interval, status, created_at, updated_at
	          FROM traders WHERE user_id = ? AND status = 'active'`

	rows, err := s.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	traders := make([]Trader, 0)
	for rows.Next() {
		var t Trader
		var symbolsJSON, timeframesJSON string

		err := rows.Scan(&t.ID, &t.UserID, &t.Name, &t.Description, &symbolsJSON, &timeframesJSON,
			&t.CheckInterval, &t.SignalCode, &t.ReanalysisInterval, &t.Status, &t.CreatedAt, &t.UpdatedAt)
		if err != nil {
			return nil, err
		}

		// Parse JSON arrays
		if err := json.Unmarshal([]byte(symbolsJSON), &t.Symbols); err != nil {
			t.Symbols = []string{}
		}
		if err := json.Unmarshal([]byte(timeframesJSON), &t.Timeframes); err != nil {
			t.Timeframes = []string{}
		}

		traders = append(traders, t)
	}

	return traders, rows.Err()
}

// GetTrader gets a trader by ID
func (s *SQLiteStorage) GetTrader(ctx context.Context, traderID string) (*Trader, error) {
	query := `SELECT id, user_id, name, description, symbols, timeframes, check_interval,
	          signal_code, reanalysis_interval, status, created_at, updated_at
	          FROM traders WHERE id = ?`

	var t Trader
	var symbolsJSON, timeframesJSON string

	err := s.db.QueryRowContext(ctx, query, traderID).Scan(
		&t.ID, &t.UserID, &t.Name, &t.Description, &symbolsJSON, &timeframesJSON,
		&t.CheckInterval, &t.SignalCode, &t.ReanalysisInterval, &t.Status, &t.CreatedAt, &t.UpdatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	// Parse JSON arrays
	if err := json.Unmarshal([]byte(symbolsJSON), &t.Symbols); err != nil {
		t.Symbols = []string{}
	}
	if err := json.Unmarshal([]byte(timeframesJSON), &t.Timeframes); err != nil {
		t.Timeframes = []string{}
	}

	return &t, nil
}

// CreateTrader creates a new trader
func (s *SQLiteStorage) CreateTrader(ctx context.Context, trader *Trader) error {
	symbolsJSON, _ := json.Marshal(trader.Symbols)
	timeframesJSON, _ := json.Marshal(trader.Timeframes)

	query := `INSERT INTO traders (id, user_id, name, description, symbols, timeframes,
	          check_interval, signal_code, reanalysis_interval, status, created_at, updated_at)
	          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	_, err := s.db.ExecContext(ctx, query,
		trader.ID, trader.UserID, trader.Name, trader.Description,
		string(symbolsJSON), string(timeframesJSON),
		trader.CheckInterval, trader.SignalCode, trader.ReanalysisInterval,
		trader.Status, trader.CreatedAt, trader.UpdatedAt)

	return err
}

// UpdateTrader updates a trader
func (s *SQLiteStorage) UpdateTrader(ctx context.Context, trader *Trader) error {
	symbolsJSON, _ := json.Marshal(trader.Symbols)
	timeframesJSON, _ := json.Marshal(trader.Timeframes)

	query := `UPDATE traders SET name = ?, description = ?, symbols = ?, timeframes = ?,
	          check_interval = ?, signal_code = ?, reanalysis_interval = ?, status = ?,
	          updated_at = ? WHERE id = ?`

	trader.UpdatedAt = time.Now()

	_, err := s.db.ExecContext(ctx, query,
		trader.Name, trader.Description, string(symbolsJSON), string(timeframesJSON),
		trader.CheckInterval, trader.SignalCode, trader.ReanalysisInterval,
		trader.Status, trader.UpdatedAt, trader.ID)

	return err
}

// DeleteTrader deletes a trader
func (s *SQLiteStorage) DeleteTrader(ctx context.Context, traderID string) error {
	query := `DELETE FROM traders WHERE id = ?`
	_, err := s.db.ExecContext(ctx, query, traderID)
	return err
}

// GetSignals gets signals for a trader
func (s *SQLiteStorage) GetSignals(ctx context.Context, traderID string, limit int) ([]Signal, error) {
	query := `SELECT id, trader_id, symbol, timeframe, signal_type, status, trigger_price,
	          target_price, stop_loss, confidence, reasoning, metadata, created_at, updated_at
	          FROM signals WHERE trader_id = ? ORDER BY created_at DESC LIMIT ?`

	rows, err := s.db.QueryContext(ctx, query, traderID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	signals := make([]Signal, 0)
	for rows.Next() {
		var s Signal
		var metadataJSON sql.NullString

		err := rows.Scan(&s.ID, &s.TraderID, &s.Symbol, &s.Timeframe, &s.SignalType,
			&s.Status, &s.TriggerPrice, &s.TargetPrice, &s.StopLoss, &s.Confidence,
			&s.Reasoning, &metadataJSON, &s.CreatedAt, &s.UpdatedAt)
		if err != nil {
			return nil, err
		}

		// Parse metadata
		if metadataJSON.Valid && metadataJSON.String != "" {
			if err := json.Unmarshal([]byte(metadataJSON.String), &s.Metadata); err != nil {
				s.Metadata = make(map[string]interface{})
			}
		} else {
			s.Metadata = make(map[string]interface{})
		}

		signals = append(signals, s)
	}

	return signals, rows.Err()
}

// CreateSignal creates a new signal
func (s *SQLiteStorage) CreateSignal(ctx context.Context, signal *Signal) error {
	metadataJSON, _ := json.Marshal(signal.Metadata)

	query := `INSERT INTO signals (id, trader_id, symbol, timeframe, signal_type, status,
	          trigger_price, target_price, stop_loss, confidence, reasoning, metadata,
	          created_at, updated_at)
	          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	_, err := s.db.ExecContext(ctx, query,
		signal.ID, signal.TraderID, signal.Symbol, signal.Timeframe, signal.SignalType,
		signal.Status, signal.TriggerPrice, signal.TargetPrice, signal.StopLoss,
		signal.Confidence, signal.Reasoning, string(metadataJSON),
		signal.CreatedAt, signal.UpdatedAt)

	return err
}

// UpdateSignal updates a signal
func (s *SQLiteStorage) UpdateSignal(ctx context.Context, signal *Signal) error {
	metadataJSON, _ := json.Marshal(signal.Metadata)

	query := `UPDATE signals SET status = ?, trigger_price = ?, target_price = ?,
	          stop_loss = ?, confidence = ?, reasoning = ?, metadata = ?, updated_at = ?
	          WHERE id = ?`

	signal.UpdatedAt = time.Now()

	_, err := s.db.ExecContext(ctx, query,
		signal.Status, signal.TriggerPrice, signal.TargetPrice, signal.StopLoss,
		signal.Confidence, signal.Reasoning, string(metadataJSON),
		signal.UpdatedAt, signal.ID)

	return err
}

// GetOpenPositions gets all open positions for a user
func (s *SQLiteStorage) GetOpenPositions(ctx context.Context, userID string) ([]Position, error) {
	query := `SELECT id, user_id, trader_id, signal_id, symbol, side, entry_price,
	          current_price, size, stop_loss, take_profit, pnl, pnl_pct, status,
	          created_at, updated_at, closed_at
	          FROM positions WHERE user_id = ? AND status = 'open'`

	rows, err := s.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	positions := make([]Position, 0)
	for rows.Next() {
		var p Position
		var signalID sql.NullString
		var closedAt sql.NullTime

		err := rows.Scan(&p.ID, &p.UserID, &p.TraderID, &signalID, &p.Symbol, &p.Side,
			&p.EntryPrice, &p.CurrentPrice, &p.Size, &p.StopLoss, &p.TakeProfit,
			&p.PNL, &p.PNLPct, &p.Status, &p.CreatedAt, &p.UpdatedAt, &closedAt)
		if err != nil {
			return nil, err
		}

		if signalID.Valid {
			p.SignalID = signalID.String
		}
		if closedAt.Valid {
			p.ClosedAt = &closedAt.Time
		}

		positions = append(positions, p)
	}

	return positions, rows.Err()
}

// GetPosition gets a position by ID
func (s *SQLiteStorage) GetPosition(ctx context.Context, positionID string) (*Position, error) {
	query := `SELECT id, user_id, trader_id, signal_id, symbol, side, entry_price,
	          current_price, size, stop_loss, take_profit, pnl, pnl_pct, status,
	          created_at, updated_at, closed_at
	          FROM positions WHERE id = ?`

	var p Position
	var signalID sql.NullString
	var closedAt sql.NullTime

	err := s.db.QueryRowContext(ctx, query, positionID).Scan(
		&p.ID, &p.UserID, &p.TraderID, &signalID, &p.Symbol, &p.Side,
		&p.EntryPrice, &p.CurrentPrice, &p.Size, &p.StopLoss, &p.TakeProfit,
		&p.PNL, &p.PNLPct, &p.Status, &p.CreatedAt, &p.UpdatedAt, &closedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	if signalID.Valid {
		p.SignalID = signalID.String
	}
	if closedAt.Valid {
		p.ClosedAt = &closedAt.Time
	}

	return &p, nil
}

// CreatePosition creates a new position
func (s *SQLiteStorage) CreatePosition(ctx context.Context, pos *Position) error {
	query := `INSERT INTO positions (id, user_id, trader_id, signal_id, symbol, side,
	          entry_price, current_price, size, stop_loss, take_profit, pnl, pnl_pct,
	          status, created_at, updated_at)
	          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	_, err := s.db.ExecContext(ctx, query,
		pos.ID, pos.UserID, pos.TraderID, pos.SignalID, pos.Symbol, pos.Side,
		pos.EntryPrice, pos.CurrentPrice, pos.Size, pos.StopLoss, pos.TakeProfit,
		pos.PNL, pos.PNLPct, pos.Status, pos.CreatedAt, pos.UpdatedAt)

	return err
}

// UpdatePosition updates a position
func (s *SQLiteStorage) UpdatePosition(ctx context.Context, pos *Position) error {
	query := `UPDATE positions SET current_price = ?, stop_loss = ?, take_profit = ?,
	          pnl = ?, pnl_pct = ?, status = ?, updated_at = ?, closed_at = ?
	          WHERE id = ?`

	pos.UpdatedAt = time.Now()

	_, err := s.db.ExecContext(ctx, query,
		pos.CurrentPrice, pos.StopLoss, pos.TakeProfit, pos.PNL, pos.PNLPct,
		pos.Status, pos.UpdatedAt, pos.ClosedAt, pos.ID)

	return err
}

// ClosePosition closes a position
func (s *SQLiteStorage) ClosePosition(ctx context.Context, positionID string) error {
	query := `UPDATE positions SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ?`

	now := time.Now()
	_, err := s.db.ExecContext(ctx, query, now, now, positionID)

	return err
}

// UpdateHeartbeat updates machine heartbeat (no-op for local SQLite)
func (s *SQLiteStorage) UpdateHeartbeat(ctx context.Context, machineID string) error {
	query := `INSERT INTO heartbeats (machine_id, last_seen) VALUES (?, ?)
	          ON CONFLICT(machine_id) DO UPDATE SET last_seen = ?`

	now := time.Now()
	_, err := s.db.ExecContext(ctx, query, machineID, now, now)

	return err
}

// Close closes the database connection
func (s *SQLiteStorage) Close() error {
	log.Info().Msg("Closing SQLite storage")
	return s.db.Close()
}
