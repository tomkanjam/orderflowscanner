package monitoring

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/vyx/go-screener/pkg/supabase"
	"github.com/vyx/go-screener/pkg/types"
)

// SupabaseAdapter adapts supabase.Client to implement the SupabaseClient interface
type SupabaseAdapter struct {
	client     *supabase.Client
	baseURL    string
	serviceKey string
}

// NewSupabaseAdapter creates a new adapter
func NewSupabaseAdapter(client *supabase.Client, baseURL, serviceKey string) *SupabaseAdapter {
	return &SupabaseAdapter{
		client:     client,
		baseURL:    baseURL,
		serviceKey: serviceKey,
	}
}

// LoadActiveMonitors loads active monitoring states from the database
func (a *SupabaseAdapter) LoadActiveMonitors(ctx context.Context) ([]*MonitoringState, error) {
	// Direct HTTP call to avoid import cycle
	// TODO: This could be refactored to use a generic query method on supabase.Client
	baseURL := a.getBaseURL()
	url := fmt.Sprintf("%s/rest/v1/monitoring_state?isActive=eq.true&select=*", baseURL)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	a.setHeaders(req)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("supabase API error: %s - %s", resp.Status, string(body))
	}

	var states []*MonitoringState
	if err := json.NewDecoder(resp.Body).Decode(&states); err != nil {
		return nil, fmt.Errorf("failed to decode monitoring states: %w", err)
	}

	return states, nil
}

// SaveMonitoringState saves a monitoring state to the database
func (a *SupabaseAdapter) SaveMonitoringState(ctx context.Context, state *MonitoringState) error {
	baseURL := a.getBaseURL()
	url := fmt.Sprintf("%s/rest/v1/monitoring_state", baseURL)

	payload, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("failed to marshal monitoring state: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(payload))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	a.setHeaders(req)
	req.Header.Set("Prefer", "resolution=merge-duplicates")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("supabase API error: %s - %s", resp.Status, string(body))
	}

	return nil
}

// UpdateSignalStatus updates signal status
func (a *SupabaseAdapter) UpdateSignalStatus(ctx context.Context, signalID string, status string) error {
	baseURL := a.getBaseURL()
	url := fmt.Sprintf("%s/rest/v1/signals?id=eq.%s", baseURL, signalID)

	payload := map[string]interface{}{
		"status": status,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "PATCH", url, bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	a.setHeaders(req)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("supabase API error: %s - %s", resp.Status, string(respBody))
	}

	return nil
}

// GetTrader fetches a trader by ID
func (a *SupabaseAdapter) GetTrader(ctx context.Context, traderID string) (*types.Trader, error) {
	baseURL := a.getBaseURL()
	url := fmt.Sprintf("%s/rest/v1/traders?id=eq.%s&select=*", baseURL, traderID)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	a.setHeaders(req)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("supabase API error: %s - %s", resp.Status, string(body))
	}

	var traders []types.Trader
	if err := json.NewDecoder(resp.Body).Decode(&traders); err != nil {
		return nil, fmt.Errorf("failed to decode trader: %w", err)
	}

	if len(traders) == 0 {
		return nil, fmt.Errorf("trader not found: %s", traderID)
	}

	return &traders[0], nil
}

// Helper methods for adapter HTTP calls
func (a *SupabaseAdapter) getBaseURL() string {
	return a.baseURL
}

func (a *SupabaseAdapter) setHeaders(req *http.Request) {
	req.Header.Set("apikey", a.serviceKey)
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", a.serviceKey))
	req.Header.Set("Content-Type", "application/json")
}

// BinanceAdapter adapts binance.Client to implement the BinanceClient interface
type BinanceAdapter struct {
	client interface {
		GetKlines(ctx context.Context, symbol string, interval string, limit int) ([]types.Kline, error)
		GetTicker(ctx context.Context, symbol string) (*types.SimplifiedTicker, error)
	}
}

// NewBinanceAdapter creates a new Binance adapter
func NewBinanceAdapter(client interface {
	GetKlines(ctx context.Context, symbol string, interval string, limit int) ([]types.Kline, error)
	GetTicker(ctx context.Context, symbol string) (*types.SimplifiedTicker, error)
}) *BinanceAdapter {
	return &BinanceAdapter{client: client}
}

// GetKlines implements BinanceClient interface
func (a *BinanceAdapter) GetKlines(ctx context.Context, symbol, interval string, limit int) ([]types.Kline, error) {
	return a.client.GetKlines(ctx, symbol, interval, limit)
}

// GetTicker implements BinanceClient interface
func (a *BinanceAdapter) GetTicker(ctx context.Context, symbol string) (*types.SimplifiedTicker, error) {
	return a.client.GetTicker(ctx, symbol)
}
