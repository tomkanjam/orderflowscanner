package analysis

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/vyx/go-screener/pkg/braintrust"
	"github.com/vyx/go-screener/pkg/openrouter"
	"github.com/vyx/go-screener/pkg/supabase"
)

// Engine orchestrates the analysis of trading signals using AI
type Engine struct {
	config     *Config
	openRouter *openrouter.Client
	calculator *Calculator
	prompter   *Prompter
	supabase   *supabase.Client
	braintrust *braintrust.Client

	// Queue management
	queue       chan *AnalysisRequest
	workerWg    sync.WaitGroup
	rateLimiter chan struct{} // Semaphore for concurrent API calls

	// Context for shutdown
	ctx    context.Context
	cancel context.CancelFunc
}

// NewEngine creates a new analysis engine
func NewEngine(config *Config, supabaseClient *supabase.Client) (*Engine, error) {
	if config == nil {
		config = DefaultConfig()
	}

	// Create OpenRouter client
	openRouterConfig := openrouter.DefaultConfig(config.OpenRouterAPIKey)
	openRouterConfig.Model = config.DefaultModel
	openRouterConfig.Temperature = config.Temperature
	openRouterConfig.MaxTokens = config.MaxTokens

	orClient, err := openrouter.NewClient(openRouterConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create OpenRouter client: %w", err)
	}

	// Create Braintrust client (optional - warns if not configured)
	btClient, err := braintrust.NewClient(config.BraintrustAPIKey, config.BraintrustProjectID)
	if err != nil {
		log.Printf("[AnalysisEngine] Warning: Braintrust client init failed: %v (tracing disabled)", err)
		btClient = &braintrust.Client{} // Disabled client
	}

	ctx, cancel := context.WithCancel(context.Background())

	engine := &Engine{
		config:      config,
		openRouter:  orClient,
		calculator:  NewCalculator(config.DefaultKlineLimit),
		prompter:    NewPrompter(),
		supabase:    supabaseClient,
		braintrust:  btClient,
		queue:       make(chan *AnalysisRequest, config.QueueSize),
		rateLimiter: make(chan struct{}, config.MaxConcurrent),
		ctx:         ctx,
		cancel:      cancel,
	}

	return engine, nil
}

// Start begins processing the analysis queue
func (e *Engine) Start() error {
	log.Printf("[AnalysisEngine] Starting with %d workers", e.config.WorkerCount)

	// Start worker goroutines
	for i := 0; i < e.config.WorkerCount; i++ {
		e.workerWg.Add(1)
		go e.worker(i)
	}

	log.Printf("[AnalysisEngine] ✅ Started successfully")
	return nil
}

// Stop gracefully shuts down the analysis engine
func (e *Engine) Stop() error {
	log.Printf("[AnalysisEngine] Shutting down...")

	// Cancel context to signal workers to stop
	e.cancel()

	// Close queue to prevent new requests
	close(e.queue)

	// Wait for all workers to finish
	e.workerWg.Wait()

	// Flush Braintrust traces
	if err := e.braintrust.Flush(); err != nil {
		log.Printf("[AnalysisEngine] Warning: Failed to flush Braintrust traces: %v", err)
	}

	log.Printf("[AnalysisEngine] ✅ Stopped successfully")
	return nil
}

// QueueAnalysis adds a signal to the analysis queue
func (e *Engine) QueueAnalysis(req *AnalysisRequest) error {
	if req == nil {
		return fmt.Errorf("analysis request is nil")
	}

	req.QueuedAt = time.Now()

	select {
	case e.queue <- req:
		log.Printf("[AnalysisEngine] Queued analysis for signal %s (queue depth: %d)",
			req.SignalID, len(e.queue))
		return nil
	default:
		return fmt.Errorf("analysis queue is full (%d/%d)", len(e.queue), cap(e.queue))
	}
}

// worker processes analysis requests from the queue
func (e *Engine) worker(id int) {
	defer e.workerWg.Done()

	log.Printf("[AnalysisEngine] Worker %d started", id)

	for {
		select {
		case <-e.ctx.Done():
			log.Printf("[AnalysisEngine] Worker %d stopped (context cancelled)", id)
			return

		case req, ok := <-e.queue:
			if !ok {
				log.Printf("[AnalysisEngine] Worker %d stopped (queue closed)", id)
				return
			}

			// Process the request
			if err := e.processRequest(req); err != nil {
				log.Printf("[AnalysisEngine] Worker %d error processing signal %s: %v",
					id, req.SignalID, err)
			}
		}
	}
}

// processRequest analyzes a single signal
func (e *Engine) processRequest(req *AnalysisRequest) error {
	// Wrap entire analysis with Braintrust tracing
	metadata := braintrust.TraceMetadata{
		Operation:     "analyze-signal",
		Symbol:        req.Symbol,
		SignalID:      req.SignalID,
		Model:         e.config.DefaultModel,
		PromptVersion: "v1.0", // TODO: Load from config
		AdditionalTags: map[string]interface{}{
			"trader_id": req.TraderID,
			"user_id":   req.UserID,
			"interval":  req.Interval,
		},
	}

	_, err := e.braintrust.TraceAnalysis(e.ctx, metadata, func() (interface{}, error) {
		startTime := time.Now()
		log.Printf("[AnalysisEngine] Processing signal %s (queued for %v)",
			req.SignalID, time.Since(req.QueuedAt))

		// 1. Calculate indicators
		indicators, err := e.calculator.CalculateIndicators(req)
		if err != nil {
			return nil, fmt.Errorf("calculate indicators: %w", err)
		}

		log.Printf("[AnalysisEngine] Calculated %d indicators for signal %s",
			len(indicators), req.SignalID)

		// 2. Build prompt
		promptStr, err := e.prompter.BuildAnalysisPrompt(req, indicators)
		if err != nil {
			return nil, fmt.Errorf("build prompt: %w", err)
		}

		// 3. Call OpenRouter with rate limiting
		e.rateLimiter <- struct{}{} // Acquire semaphore
		defer func() { <-e.rateLimiter }() // Release semaphore

		ctx, cancel := context.WithTimeout(e.ctx, e.config.RequestTimeout)
		defer cancel()

		chatReq := &openrouter.ChatRequest{
			SystemPrompt: openrouter.SystemPrompts.SignalAnalysis,
			UserPrompt:   promptStr,
		}

		resp, err := e.openRouter.Chat(ctx, chatReq)
		if err != nil {
			return nil, fmt.Errorf("openrouter call: %w", err)
		}

		log.Printf("[AnalysisEngine] Received AI response for signal %s (latency: %v, tokens: %d)",
			req.SignalID, resp.Latency, resp.Usage.TotalTokens)

		// Update metadata with token usage
		metadata.TokensUsed = resp.Usage.TotalTokens

		// 4. Parse response
		analysisResult, err := openrouter.ParseAnalysisResult(resp.Content)
		if err != nil {
			return nil, fmt.Errorf("parse response: %w", err)
		}

		// 5. Validate and sanitize
		if err := openrouter.ValidateAndSanitize(analysisResult); err != nil {
			return nil, fmt.Errorf("validate response: %w", err)
		}

		// 6. Save to database
		totalLatency := time.Since(startTime)
		if err := e.saveAnalysisResult(req, analysisResult, indicators, resp, totalLatency); err != nil {
			return nil, fmt.Errorf("save analysis: %w", err)
		}

		log.Printf("[AnalysisEngine] ✅ Completed analysis for signal %s: decision=%s confidence=%.2f (total: %v)",
			req.SignalID, analysisResult.Decision, analysisResult.Confidence, totalLatency)

		return analysisResult, nil
	})

	return err
}

// saveAnalysisResult persists the analysis to the database
func (e *Engine) saveAnalysisResult(
	req *AnalysisRequest,
	analysis *openrouter.AnalysisResult,
	indicators map[string]interface{},
	resp *openrouter.ChatResponse,
	totalLatency time.Duration,
) error {
	// TODO: Implement database persistence
	// For now, just log the result
	log.Printf("[AnalysisEngine] Would save analysis: signal=%s decision=%s confidence=%.2f",
		req.SignalID, analysis.Decision, analysis.Confidence)

	// Format analysis for logging
	logMsg := openrouter.FormatAnalysisForLog(analysis)
	log.Printf("[AnalysisEngine] Analysis details:\n%s", logMsg)

	return nil
}

// GetQueueDepth returns the current number of requests in the queue
func (e *Engine) GetQueueDepth() int {
	return len(e.queue)
}

// GetQueueCapacity returns the maximum queue capacity
func (e *Engine) GetQueueCapacity() int {
	return cap(e.queue)
}
