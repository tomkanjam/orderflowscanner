package openrouter

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/revrost/go-openrouter"
)

// Client wraps the OpenRouter API client with convenience methods for trading analysis
type Client struct {
	client *openrouter.Client
	config *Config
}

// Config holds OpenRouter client configuration
type Config struct {
	APIKey      string
	Model       string        // Default model to use (e.g., "google/gemini-2.5-flash")
	MaxRetries  int           // Maximum number of retry attempts
	RetryDelay  time.Duration // Delay between retries
	Temperature float64       // Default temperature for responses
	MaxTokens   int           // Maximum tokens in response
}

// DefaultConfig returns default OpenRouter configuration
func DefaultConfig(apiKey string) *Config {
	return &Config{
		APIKey:      apiKey,
		Model:       "google/gemini-2.5-flash", // Default to Gemini 2.5 Flash
		MaxRetries:  3,
		RetryDelay:  2 * time.Second,
		Temperature: 0.2, // Low temperature for consistent trading analysis
		MaxTokens:   4000,
	}
}

// NewClient creates a new OpenRouter client wrapper
func NewClient(config *Config) (*Client, error) {
	if config == nil {
		return nil, fmt.Errorf("config cannot be nil")
	}

	if config.APIKey == "" {
		return nil, fmt.Errorf("API key is required")
	}

	// Create the underlying OpenRouter client
	client := openrouter.NewClient(config.APIKey)

	return &Client{
		client: client,
		config: config,
	}, nil
}

// ChatRequest represents a request to the chat completion API
type ChatRequest struct {
	SystemPrompt string
	UserPrompt   string
	Model        string  // Optional: override default model
	Temperature  float64 // Optional: override default temperature
	MaxTokens    int     // Optional: override default max tokens
}

// ChatResponse represents a response from the chat completion API
type ChatResponse struct {
	Content      string
	Model        string
	FinishReason string
	Usage        Usage
	Latency      time.Duration
}

// Usage represents token usage information
type Usage struct {
	PromptTokens     int
	CompletionTokens int
	TotalTokens      int
}

// Chat sends a chat completion request with retry logic
func (c *Client) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	if req == nil {
		return nil, fmt.Errorf("request cannot be nil")
	}

	// Use config defaults if not specified in request
	model := c.config.Model
	if req.Model != "" {
		model = req.Model
	}

	temperature := float32(c.config.Temperature)
	if req.Temperature > 0 {
		temperature = float32(req.Temperature)
	}

	maxTokens := c.config.MaxTokens
	if req.MaxTokens > 0 {
		maxTokens = req.MaxTokens
	}

	// Build messages
	messages := []openrouter.ChatCompletionMessage{
		openrouter.SystemMessage(req.SystemPrompt),
		openrouter.UserMessage(req.UserPrompt),
	}

	// Build request
	chatReq := openrouter.ChatCompletionRequest{
		Model:       model,
		Messages:    messages,
		Temperature: temperature,
		MaxTokens:   maxTokens,
	}

	// Execute with retry logic
	var resp openrouter.ChatCompletionResponse
	var err error
	startTime := time.Now()

	for attempt := 0; attempt <= c.config.MaxRetries; attempt++ {
		// Check context cancellation
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		// Make the API call
		resp, err = c.client.CreateChatCompletion(ctx, chatReq)
		if err == nil && len(resp.Choices) > 0 {
			// Success!
			break
		}

		// Log the error
		if attempt < c.config.MaxRetries {
			log.Printf("[OpenRouter] Attempt %d/%d failed: %v (retrying in %v)",
				attempt+1, c.config.MaxRetries+1, err, c.config.RetryDelay)

			// Wait before retry
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(c.config.RetryDelay):
				// Continue to next attempt
			}
		}
	}

	// Check if all retries failed
	if err != nil {
		return nil, fmt.Errorf("all retry attempts failed: %w", err)
	}

	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("empty response from OpenRouter")
	}

	// Parse the response
	latency := time.Since(startTime)
	choice := resp.Choices[0]

	// Extract content text
	content := choice.Message.Content.Text

	return &ChatResponse{
		Content:      content,
		Model:        resp.Model,
		FinishReason: string(choice.FinishReason),
		Usage: Usage{
			PromptTokens:     resp.Usage.PromptTokens,
			CompletionTokens: resp.Usage.CompletionTokens,
			TotalTokens:      resp.Usage.TotalTokens,
		},
		Latency: latency,
	}, nil
}

// ChatJSON sends a chat completion request and parses the response as JSON
// This is useful for structured responses from the AI
func (c *Client) ChatJSON(ctx context.Context, req *ChatRequest, result interface{}) error {
	resp, err := c.Chat(ctx, req)
	if err != nil {
		return err
	}

	// Parse JSON response
	if err := json.Unmarshal([]byte(resp.Content), result); err != nil {
		return fmt.Errorf("failed to parse JSON response: %w (content: %s)", err, resp.Content)
	}

	return nil
}

// GetConfig returns the client configuration
func (c *Client) GetConfig() *Config {
	return c.config
}

// SetModel updates the default model
func (c *Client) SetModel(model string) {
	c.config.Model = model
}

// SetTemperature updates the default temperature
func (c *Client) SetTemperature(temperature float64) {
	c.config.Temperature = temperature
}
