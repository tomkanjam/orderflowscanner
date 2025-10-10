package supabase

import (
	"bytes"
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
func (c *Client) GetTraders(userID string) ([]types.Trader, error) {
	url := fmt.Sprintf("%s/rest/v1/traders?userId=eq.%s&select=*", c.baseURL, userID)

	req, err := http.NewRequest("GET", url, nil)
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

// GetBuiltInTraders fetches all built-in traders (visible ones)
func (c *Client) GetBuiltInTraders() ([]types.Trader, error) {
	url := fmt.Sprintf("%s/rest/v1/traders?isBuiltIn=eq.true&isVisible=eq.true&select=*", c.baseURL)

	req, err := http.NewRequest("GET", url, nil)
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

// CreateSignal creates a new signal in the database
func (c *Client) CreateSignal(signal *types.Signal) error {
	url := fmt.Sprintf("%s/rest/v1/signals", c.baseURL)

	payload, err := json.Marshal(signal)
	if err != nil {
		return fmt.Errorf("failed to marshal signal: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(payload))
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
func (c *Client) GetUser(userID string) (*types.User, error) {
	url := fmt.Sprintf("%s/rest/v1/user_profiles?id=eq.%s&select=*", c.baseURL, userID)

	req, err := http.NewRequest("GET", url, nil)
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
func (c *Client) UpdateMachineStatus(machineID, userID, status string) error {
	url := fmt.Sprintf("%s/rest/v1/cloud_machines?machineId=eq.%s&userId=eq.%s", c.baseURL, machineID, userID)

	payload := map[string]interface{}{
		"status":    status,
		"updatedAt": time.Now().UTC(),
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequest("PATCH", url, bytes.NewBuffer(body))
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
func (c *Client) GetTraderPreferences(traderID, userID string) (*types.TraderPreferences, error) {
	url := fmt.Sprintf("%s/rest/v1/trader_preferences?traderId=eq.%s&userId=eq.%s&select=*",
		c.baseURL, traderID, userID)

	req, err := http.NewRequest("GET", url, nil)
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
	url := fmt.Sprintf("%s/rest/v1/", c.baseURL)

	req, err := http.NewRequest("GET", url, nil)
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
