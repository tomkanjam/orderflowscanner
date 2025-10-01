package storage

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/rs/zerolog/log"
)

// SupabaseStorage implements Storage interface using Supabase REST API
type SupabaseStorage struct {
	url       string
	apiKey    string
	client    *http.Client
}

// NewSupabaseStorage creates a new Supabase storage
func NewSupabaseStorage(url, apiKey string) (*SupabaseStorage, error) {
	if url == "" || apiKey == "" {
		return nil, fmt.Errorf("supabase URL and API key are required")
	}

	log.Info().Str("url", url).Msg("Supabase storage initialized")

	return &SupabaseStorage{
		url:    url,
		apiKey: apiKey,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}, nil
}

// makeRequest makes an HTTP request to Supabase
func (s *SupabaseStorage) makeRequest(ctx context.Context, method, endpoint string, body interface{}, result interface{}) error {
	var bodyReader io.Reader
	if body != nil {
		jsonData, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("failed to marshal body: %w", err)
		}
		bodyReader = bytes.NewReader(jsonData)
	}

	url := fmt.Sprintf("%s/rest/v1/%s", s.url, endpoint)
	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("apikey", s.apiKey)
	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Prefer", "return=representation")

	// Execute request
	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	// Read response body
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response: %w", err)
	}

	// Check status code
	if resp.StatusCode >= 400 {
		return fmt.Errorf("supabase error (status %d): %s", resp.StatusCode, string(responseBody))
	}

	// Parse result if provided
	if result != nil && len(responseBody) > 0 {
		if err := json.Unmarshal(responseBody, result); err != nil {
			return fmt.Errorf("failed to parse response: %w", err)
		}
	}

	return nil
}

// GetActiveTraders gets all active traders for a user
func (s *SupabaseStorage) GetActiveTraders(ctx context.Context, userID string) ([]Trader, error) {
	endpoint := fmt.Sprintf("traders?user_id=eq.%s&status=eq.active&select=*", userID)

	var traders []Trader
	if err := s.makeRequest(ctx, "GET", endpoint, nil, &traders); err != nil {
		return nil, err
	}

	return traders, nil
}

// GetTrader gets a trader by ID
func (s *SupabaseStorage) GetTrader(ctx context.Context, traderID string) (*Trader, error) {
	endpoint := fmt.Sprintf("traders?id=eq.%s&select=*", traderID)

	var traders []Trader
	if err := s.makeRequest(ctx, "GET", endpoint, nil, &traders); err != nil {
		return nil, err
	}

	if len(traders) == 0 {
		return nil, nil
	}

	return &traders[0], nil
}

// CreateTrader creates a new trader
func (s *SupabaseStorage) CreateTrader(ctx context.Context, trader *Trader) error {
	endpoint := "traders"

	var result []Trader
	if err := s.makeRequest(ctx, "POST", endpoint, trader, &result); err != nil {
		return err
	}

	return nil
}

// UpdateTrader updates a trader
func (s *SupabaseStorage) UpdateTrader(ctx context.Context, trader *Trader) error {
	endpoint := fmt.Sprintf("traders?id=eq.%s", trader.ID)

	trader.UpdatedAt = time.Now()

	if err := s.makeRequest(ctx, "PATCH", endpoint, trader, nil); err != nil {
		return err
	}

	return nil
}

// DeleteTrader deletes a trader
func (s *SupabaseStorage) DeleteTrader(ctx context.Context, traderID string) error {
	endpoint := fmt.Sprintf("traders?id=eq.%s", traderID)

	if err := s.makeRequest(ctx, "DELETE", endpoint, nil, nil); err != nil {
		return err
	}

	return nil
}

// GetSignals gets signals for a trader
func (s *SupabaseStorage) GetSignals(ctx context.Context, traderID string, limit int) ([]Signal, error) {
	endpoint := fmt.Sprintf("signals?trader_id=eq.%s&order=created_at.desc&limit=%d&select=*", traderID, limit)

	var signals []Signal
	if err := s.makeRequest(ctx, "GET", endpoint, nil, &signals); err != nil {
		return nil, err
	}

	return signals, nil
}

// CreateSignal creates a new signal
func (s *SupabaseStorage) CreateSignal(ctx context.Context, signal *Signal) error {
	endpoint := "signals"

	var result []Signal
	if err := s.makeRequest(ctx, "POST", endpoint, signal, &result); err != nil {
		return err
	}

	return nil
}

// UpdateSignal updates a signal
func (s *SupabaseStorage) UpdateSignal(ctx context.Context, signal *Signal) error {
	endpoint := fmt.Sprintf("signals?id=eq.%s", signal.ID)

	signal.UpdatedAt = time.Now()

	if err := s.makeRequest(ctx, "PATCH", endpoint, signal, nil); err != nil {
		return err
	}

	return nil
}

// GetOpenPositions gets all open positions for a user
func (s *SupabaseStorage) GetOpenPositions(ctx context.Context, userID string) ([]Position, error) {
	endpoint := fmt.Sprintf("positions?user_id=eq.%s&status=eq.open&select=*", userID)

	var positions []Position
	if err := s.makeRequest(ctx, "GET", endpoint, nil, &positions); err != nil {
		return nil, err
	}

	return positions, nil
}

// GetPosition gets a position by ID
func (s *SupabaseStorage) GetPosition(ctx context.Context, positionID string) (*Position, error) {
	endpoint := fmt.Sprintf("positions?id=eq.%s&select=*", positionID)

	var positions []Position
	if err := s.makeRequest(ctx, "GET", endpoint, nil, &positions); err != nil {
		return nil, err
	}

	if len(positions) == 0 {
		return nil, nil
	}

	return &positions[0], nil
}

// CreatePosition creates a new position
func (s *SupabaseStorage) CreatePosition(ctx context.Context, pos *Position) error {
	endpoint := "positions"

	var result []Position
	if err := s.makeRequest(ctx, "POST", endpoint, pos, &result); err != nil {
		return err
	}

	return nil
}

// UpdatePosition updates a position
func (s *SupabaseStorage) UpdatePosition(ctx context.Context, pos *Position) error {
	endpoint := fmt.Sprintf("positions?id=eq.%s", pos.ID)

	pos.UpdatedAt = time.Now()

	if err := s.makeRequest(ctx, "PATCH", endpoint, pos, nil); err != nil {
		return err
	}

	return nil
}

// ClosePosition closes a position
func (s *SupabaseStorage) ClosePosition(ctx context.Context, positionID string) error {
	now := time.Now()
	update := map[string]interface{}{
		"status":     "closed",
		"closed_at":  now,
		"updated_at": now,
	}

	endpoint := fmt.Sprintf("positions?id=eq.%s", positionID)

	if err := s.makeRequest(ctx, "PATCH", endpoint, update, nil); err != nil {
		return err
	}

	return nil
}

// UpdateHeartbeat updates machine heartbeat
func (s *SupabaseStorage) UpdateHeartbeat(ctx context.Context, machineID string) error {
	now := time.Now()
	heartbeat := map[string]interface{}{
		"machine_id": machineID,
		"last_seen":  now,
	}

	endpoint := "heartbeats"

	// Try to upsert (create or update)
	if err := s.makeRequest(ctx, "POST", endpoint, heartbeat, nil); err != nil {
		// If insert fails, try update
		endpoint = fmt.Sprintf("heartbeats?machine_id=eq.%s", machineID)
		updateData := map[string]interface{}{
			"last_seen": now,
		}
		return s.makeRequest(ctx, "PATCH", endpoint, updateData, nil)
	}

	return nil
}

// Close closes the storage (no-op for HTTP client)
func (s *SupabaseStorage) Close() error {
	log.Info().Msg("Closing Supabase storage")
	return nil
}
