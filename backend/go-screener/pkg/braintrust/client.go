package braintrust

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

// Client wraps Braintrust REST API for observability
type Client struct {
	apiKey     string
	projectID  string
	httpClient *http.Client
	mu         sync.Mutex
	enabled    bool
	logQueue   []LogEvent
}

// TraceMetadata contains metadata for trace logging
type TraceMetadata struct {
	Operation      string
	Symbol         string
	SignalID       string
	Model          string
	PromptVersion  string
	TokensUsed     int
	LatencyMs      int64
	AdditionalTags map[string]interface{}
}

// LogEvent represents a single log event to send to Braintrust
type LogEvent struct {
	ID        string                 `json:"id,omitempty"`
	ProjectID string                 `json:"project_id"`
	SpanID    string                 `json:"span_id,omitempty"`
	Input     interface{}            `json:"input,omitempty"`
	Output    interface{}            `json:"output,omitempty"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
	Metrics   map[string]float64     `json:"metrics,omitempty"`
	Error     string                 `json:"error,omitempty"`
	Timestamp time.Time              `json:"timestamp"`
}

// NewClient creates a new Braintrust client
func NewClient(apiKey, projectID string) (*Client, error) {
	if apiKey == "" {
		log.Println("[Braintrust] Warning: BRAINTRUST_API_KEY not set, tracing disabled")
		return &Client{enabled: false, httpClient: &http.Client{Timeout: 10 * time.Second}}, nil
	}

	if projectID == "" {
		return nil, fmt.Errorf("BRAINTRUST_PROJECT_ID is required when API key is set")
	}

	log.Printf("[Braintrust] Initialized with project ID: %s\n", projectID)

	return &Client{
		apiKey:     apiKey,
		projectID:  projectID,
		httpClient: &http.Client{Timeout: 10 * time.Second},
		enabled:    true,
		logQueue:   make([]LogEvent, 0, 100),
	}, nil
}

// NewClientFromEnv creates a client from environment variables
func NewClientFromEnv() (*Client, error) {
	apiKey := os.Getenv("BRAINTRUST_API_KEY")
	projectID := os.Getenv("BRAINTRUST_PROJECT_ID")

	return NewClient(apiKey, projectID)
}

// TraceAnalysis wraps an analysis operation with Braintrust tracing
func (c *Client) TraceAnalysis(ctx context.Context, metadata TraceMetadata, fn func() (interface{}, error)) (interface{}, error) {
	if !c.enabled {
		// If tracing is disabled, just run the function
		return fn()
	}

	startTime := time.Now()

	// Execute the function
	result, err := fn()
	latencyMs := time.Since(startTime).Milliseconds()

	// Build log event
	event := LogEvent{
		ProjectID: c.projectID,
		Timestamp: startTime,
		Input: map[string]interface{}{
			"operation":      metadata.Operation,
			"symbol":         metadata.Symbol,
			"signal_id":      metadata.SignalID,
			"prompt_version": metadata.PromptVersion,
		},
		Metadata: metadata.AdditionalTags,
		Metrics: map[string]float64{
			"latency_ms": float64(latencyMs),
		},
	}

	if err != nil {
		event.Error = err.Error()
		event.Output = map[string]interface{}{
			"error": err.Error(),
		}
	} else {
		event.Output = result
		if metadata.TokensUsed > 0 {
			event.Metrics["total_tokens"] = float64(metadata.TokensUsed)
		}
	}

	// Queue the event for batching
	c.queueEvent(event)

	return result, err
}

// queueEvent adds an event to the queue
func (c *Client) queueEvent(event LogEvent) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.logQueue = append(c.logQueue, event)

	// Auto-flush if queue is getting large
	if len(c.logQueue) >= 50 {
		go c.Flush()
	}
}

// LogLLMCall logs a raw LLM call for debugging
func (c *Client) LogLLMCall(ctx context.Context, model, prompt, response string, tokensUsed int) {
	if !c.enabled {
		return
	}

	event := LogEvent{
		ProjectID: c.projectID,
		Timestamp: time.Now(),
		Input: map[string]interface{}{
			"model":  model,
			"prompt": prompt,
		},
		Output: map[string]interface{}{
			"response": response,
		},
		Metrics: map[string]float64{
			"total_tokens": float64(tokensUsed),
		},
		Metadata: map[string]interface{}{
			"model_name": model,
		},
	}

	c.queueEvent(event)
}

// Flush ensures all traces are sent to Braintrust
func (c *Client) Flush() error {
	if !c.enabled {
		return nil
	}

	c.mu.Lock()
	events := make([]LogEvent, len(c.logQueue))
	copy(events, c.logQueue)
	c.logQueue = c.logQueue[:0] // Clear queue
	c.mu.Unlock()

	if len(events) == 0 {
		return nil
	}

	// Send events to Braintrust API
	payload := map[string]interface{}{
		"events": events,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal events: %w", err)
	}

	req, err := http.NewRequest("POST", "https://api.braintrust.dev/v1/project_logs/insert", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send events: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("braintrust API error: status %d", resp.StatusCode)
	}

	log.Printf("[Braintrust] Flushed %d events\n", len(events))
	return nil
}

// LoadPrompt loads a prompt from Braintrust REST API
func (c *Client) LoadPrompt(ctx context.Context, slug, version string) (string, error) {
	if !c.enabled {
		return "", fmt.Errorf("Braintrust client not enabled")
	}

	url := fmt.Sprintf("https://api.braintrust.dev/v1/prompt?project_id=%s&slug=%s", c.projectID, slug)
	if version != "" {
		url += fmt.Sprintf("&version=%s", version)
	}

	log.Printf("[Braintrust] Loading prompt: %s (version: %s)\n", slug, version)

	// TODO: Implement HTTP request to Braintrust REST API
	// For now, return an error to indicate this needs implementation
	return "", fmt.Errorf("prompt loading from Braintrust not yet implemented in Go client")
}

// IsEnabled returns whether Braintrust tracing is enabled
func (c *Client) IsEnabled() bool {
	return c.enabled
}

// MarshalJSON converts metadata to JSON for logging
func (m TraceMetadata) MarshalJSON() ([]byte, error) {
	return json.Marshal(map[string]interface{}{
		"operation":       m.Operation,
		"symbol":          m.Symbol,
		"signal_id":       m.SignalID,
		"model":           m.Model,
		"prompt_version":  m.PromptVersion,
		"tokens_used":     m.TokensUsed,
		"latency_ms":      m.LatencyMs,
		"additional_tags": m.AdditionalTags,
	})
}
