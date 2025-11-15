package supabase

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/vyx/go-screener/pkg/types"
)

// Client handles Supabase REST API interactions
type Client struct {
	baseURL    string
	serviceKey string
	httpClient *http.Client
}

// NewClient creates a new Supabase client
func NewClient(baseURL, serviceKey string) *Client {
	return &Client{
		baseURL:    baseURL,
		serviceKey: serviceKey,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// GetTraders fetches all traders for a user
// GetAllTraders fetches all enabled traders regardless of ownership
func (c *Client) GetAllTraders(ctx context.Context) ([]types.Trader, error) {
	url := fmt.Sprintf("%s/rest/v1/traders?enabled=eq.true&select=*", c.baseURL)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(body))
	}

	var traders []types.Trader
	if err := json.NewDecoder(resp.Body).Decode(&traders); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return traders, nil
}

func (c *Client) GetTraders(ctx context.Context, userID string) ([]types.Trader, error) {
	url := fmt.Sprintf("%s/rest/v1/traders?user_id=eq.%s&select=*", c.baseURL, userID)

	// Debug logging
	log.Printf("[Supabase] GetTraders called with userID: %s", userID)
	log.Printf("[Supabase] Request URL: %s", url)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)

	// Debug log headers (excluding sensitive values)
	log.Printf("[Supabase] Request headers: apikey=%s..., Authorization=Bearer %s...",
		c.serviceKey[:10], c.serviceKey[:10])

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	log.Printf("[Supabase] Response status: %d", resp.StatusCode)

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("[Supabase] Error response body: %s", string(body))
		return nil, fmt.Errorf("supabase API error: %s - %s", resp.Status, string(body))
	}

	// Read the body first so we can log it
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	log.Printf("[Supabase] Response body: %s", string(bodyBytes))

	var traders []types.Trader
	if err := json.Unmarshal(bodyBytes, &traders); err != nil {
		return nil, fmt.Errorf("failed to decode traders: %w", err)
	}

	log.Printf("[Supabase] Decoded %d traders", len(traders))
	for i, t := range traders {
		log.Printf("[Supabase] Trader %d: id=%s, name=%s, user_id=%v, is_built_in=%v, enabled=%v",
			i, t.ID, t.Name, t.UserID, t.IsBuiltIn, t.Enabled)
	}

	return traders, nil
}

// GetBuiltInTraders fetches all built-in traders
func (c *Client) GetBuiltInTraders(ctx context.Context) ([]types.Trader, error) {
	url := fmt.Sprintf("%s/rest/v1/traders?is_built_in=eq.true&select=*", c.baseURL)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)

	resp, err := c.httpClient.Do(req)
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
		return nil, fmt.Errorf("failed to decode traders: %w", err)
	}

	return traders, nil
}

// GetTrader fetches a single trader by ID
func (c *Client) GetTrader(ctx context.Context, traderID string) (*types.Trader, error) {
	url := fmt.Sprintf("%s/rest/v1/traders?id=eq.%s&select=*", c.baseURL, traderID)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)

	resp, err := c.httpClient.Do(req)
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

// CreateSignal creates a new signal in the database
func (c *Client) CreateSignal(ctx context.Context, signal *types.Signal) error {
	url := fmt.Sprintf("%s/rest/v1/signals", c.baseURL)

	payload, err := json.Marshal(signal)
	if err != nil {
		return fmt.Errorf("failed to marshal signal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(payload))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)
	req.Header.Set("Prefer", "return=minimal")

	resp, err := c.httpClient.Do(req)
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

// CreateSignalsBatch creates multiple signals in a single database request
func (c *Client) CreateSignalsBatch(ctx context.Context, signals []*types.Signal) error {
	if len(signals) == 0 {
		return nil
	}

	url := fmt.Sprintf("%s/rest/v1/signals", c.baseURL)

	// Marshal the entire array for batch insert
	payload, err := json.Marshal(signals)
	if err != nil {
		return fmt.Errorf("failed to marshal signals: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(payload))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)
	req.Header.Set("Prefer", "return=minimal")

	resp, err := c.httpClient.Do(req)
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

// GetUser fetches user information by ID
func (c *Client) GetUser(ctx context.Context, userID string) (*types.User, error) {
	url := fmt.Sprintf("%s/rest/v1/user_profiles?id=eq.%s&select=*", c.baseURL, userID)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("supabase API error: %s - %s", resp.Status, string(body))
	}

	var users []types.User
	if err := json.NewDecoder(resp.Body).Decode(&users); err != nil {
		return nil, fmt.Errorf("failed to decode user: %w", err)
	}

	if len(users) == 0 {
		return nil, fmt.Errorf("user not found")
	}

	return &users[0], nil
}

// UpdateMachineStatus updates the machine status in the database
func (c *Client) UpdateMachineStatus(ctx context.Context, machineID, userID, status string) error {
	url := fmt.Sprintf("%s/rest/v1/cloud_machines?machine_id=eq.%s&user_id=eq.%s", c.baseURL, machineID, userID)

	payload := map[string]interface{}{
		"status":    status,
		"updatedAt": time.Now().UTC(),
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "PATCH", url, bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)

	resp, err := c.httpClient.Do(req)
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

// GetTraderPreferences fetches preferences for a trader
func (c *Client) GetTraderPreferences(ctx context.Context, traderID, userID string) (*types.TraderPreferences, error) {
	url := fmt.Sprintf("%s/rest/v1/trader_preferences?trader_id=eq.%s&user_id=eq.%s&select=*",
		c.baseURL, traderID, userID)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("supabase API error: %s - %s", resp.Status, string(body))
	}

	var prefs []types.TraderPreferences
	if err := json.NewDecoder(resp.Body).Decode(&prefs); err != nil {
		return nil, fmt.Errorf("failed to decode preferences: %w", err)
	}

	if len(prefs) == 0 {
		return nil, nil // No preferences found
	}

	return &prefs[0], nil
}

// setHeaders sets common headers for Supabase requests
func (c *Client) setHeaders(req *http.Request) {
	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.serviceKey))
	req.Header.Set("Content-Type", "application/json")
}

// HealthCheck performs a health check against Supabase
func (c *Client) HealthCheck() error {
	ctx := context.Background()
	url := fmt.Sprintf("%s/rest/v1/", c.baseURL)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		return fmt.Errorf("supabase unavailable: %s", resp.Status)
	}

	return nil
}
