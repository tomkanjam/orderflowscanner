package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/cors"
	"github.com/vyx/go-screener/internal/analysis"
	"github.com/vyx/go-screener/internal/eventbus"
	"github.com/vyx/go-screener/internal/monitoring"
	"github.com/vyx/go-screener/internal/scheduler"
	"github.com/vyx/go-screener/internal/trader"
	"github.com/vyx/go-screener/pkg/binance"
	"github.com/vyx/go-screener/pkg/cache"
	"github.com/vyx/go-screener/pkg/config"
	"github.com/vyx/go-screener/pkg/supabase"
	"github.com/vyx/go-screener/pkg/types"
	"github.com/vyx/go-screener/pkg/yaegi"
)

// Server represents the HTTP server
type Server struct {
	config          *config.Config
	router          *mux.Router
	httpServer      *http.Server
	binanceClient   *binance.Client
	supabaseClient  *supabase.Client
	yaegiExecutor   *yaegi.Executor

	// WebSocket & Cache
	klineCache      *cache.KlineCache
	wsClient        *binance.WSClient

	// Event-driven architecture
	eventBus        *eventbus.EventBus
	candleScheduler *scheduler.CandleScheduler
	analysisEngine  *analysis.Engine
	monitoringEngine *monitoring.Engine
	traderExecutor  *trader.Executor

	traderManager   *trader.Manager
	traderHandler   *TraderHandler
	corsHandler     *cors.Cors
	startTime       time.Time
}

// New creates a new server instance
func New(cfg *config.Config) (*Server, error) {
	log.Printf("[Server] Initializing event-driven architecture...")

	// Initialize clients
	binanceClient := binance.NewClient(cfg.BinanceAPIURL)
	supabaseClient := supabase.NewClient(cfg.SupabaseURL, cfg.SupabaseServiceKey)

	// Initialize Yaegi executor
	yaegiExec, err := yaegi.NewExecutor()
	if err != nil {
		return nil, fmt.Errorf("failed to create yaegi executor: %w", err)
	}

	// Initialize kline cache (keep last 500 candles per symbol/interval)
	klineCache := cache.NewKlineCache(500)
	log.Printf("[Server] ✅ Kline Cache initialized (max 500 candles per symbol/interval)")

	// Initialize WebSocket client
	wsClient := binance.NewWSClient(cfg.BinanceWSURL, klineCache)
	log.Printf("[Server] ✅ WebSocket Client initialized")

	// 1. Initialize Event Bus
	eventBus := eventbus.NewEventBus()
	log.Printf("[Server] ✅ Event Bus initialized")

	// 2. Initialize Candle Scheduler
	schedulerConfig := scheduler.DefaultConfig()
	candleScheduler := scheduler.NewCandleScheduler(eventBus, schedulerConfig)
	log.Printf("[Server] ✅ Candle Scheduler initialized")

	// 3. Initialize Analysis Engine (optional - skip if OpenRouter key not provided)
	analysisConfig := analysis.DefaultConfig()
	analysisConfig.OpenRouterAPIKey = cfg.GetOpenRouterAPIKey() // Add method to get API key from env

	var analysisEngine *analysis.Engine = nil
	if analysisConfig.OpenRouterAPIKey != "" {
		var err error
		analysisEngine, err = analysis.NewEngine(
			analysisConfig,
			supabaseClient,
		)
		if err != nil {
			log.Printf("[Server] ⚠️  Failed to create analysis engine: %v", err)
			log.Printf("[Server] ⚠️  Analysis engine disabled - continuing without AI analysis")
		} else {
			log.Printf("[Server] ✅ Analysis Engine initialized")
		}
	} else {
		log.Printf("[Server] ⚠️  OpenRouter API key not set - analysis engine disabled")
	}

	// 4. Initialize Monitoring Engine (only if analysis engine is available)
	var monitoringEngine *monitoring.Engine = nil
	if analysisEngine != nil {
		supabaseAdapter := monitoring.NewSupabaseAdapter(supabaseClient, cfg.SupabaseURL, cfg.SupabaseServiceKey)
		binanceAdapter := monitoring.NewBinanceAdapter(binanceClient)

		monitoringConfig := monitoring.DefaultConfig()
		monitoringEngine = monitoring.NewEngine(
			monitoringConfig,
			analysisEngine,
			eventBus,
			supabaseAdapter,
			binanceAdapter,
		)
		log.Printf("[Server] ✅ Monitoring Engine initialized")
	} else {
		log.Printf("[Server] ⚠️  Monitoring engine disabled (requires analysis engine)")
	}

	// 5. Initialize Trader Executor (event-driven)
	traderExecutor := trader.NewExecutor(
		yaegiExec,
		binanceClient,
		supabaseClient,
		analysisEngine,
		eventBus,
		klineCache,
	)
	log.Printf("[Server] ✅ Trader Executor initialized")

	// 6. Initialize Trader Manager
	traderManager := trader.NewManager(cfg, traderExecutor, supabaseClient, yaegiExec)
	traderHandler := NewTraderHandler(traderManager, supabaseClient)
	log.Printf("[Server] ✅ Trader Manager initialized")

	s := &Server{
		config:           cfg,
		binanceClient:    binanceClient,
		supabaseClient:   supabaseClient,
		yaegiExecutor:    yaegiExec,
		klineCache:       klineCache,
		wsClient:         wsClient,
		eventBus:         eventBus,
		candleScheduler:  candleScheduler,
		analysisEngine:   analysisEngine,
		monitoringEngine: monitoringEngine,
		traderExecutor:   traderExecutor,
		traderManager:    traderManager,
		traderHandler:    traderHandler,
		startTime:        time.Now(),
	}

	// Setup router
	s.setupRouter()

	// Create HTTP server with CORS-wrapped handler
	s.httpServer = &http.Server{
		Addr:         fmt.Sprintf("%s:%d", cfg.ServerHost, cfg.ServerPort),
		Handler:      s.corsHandler.Handler(s.router),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	return s, nil
}

// setupRouter configures all routes
func (s *Server) setupRouter() {
	r := mux.NewRouter()

	// Health check
	r.HandleFunc("/health", s.handleHealth).Methods("GET")
	r.HandleFunc("/", s.handleHealth).Methods("GET")

	// Prometheus metrics endpoint
	r.Handle("/metrics", promhttp.Handler()).Methods("GET")

	// API routes
	api := r.PathPrefix("/api/v1").Subrouter()

	// Symbols
	api.HandleFunc("/symbols", s.handleGetSymbols).Methods("GET")

	// Klines
	api.HandleFunc("/klines/{symbol}/{interval}", s.handleGetKlines).Methods("GET")

	// Traders
	api.HandleFunc("/traders", s.handleGetTraders).Methods("GET")
	api.HandleFunc("/traders/{id}", s.handleGetTrader).Methods("GET")

	// Signals
	api.HandleFunc("/signals", s.handleCreateSignal).Methods("POST")
	api.HandleFunc("/signals", s.handleGetSignals).Methods("GET")

	// Execute filter
	api.HandleFunc("/execute-filter", s.handleExecuteFilter).Methods("POST")

	// Validate code
	api.HandleFunc("/validate-code", s.handleValidateCode).Methods("POST")

	// Trader management (requires authentication and tier check)
	traderAPI := api.PathPrefix("/traders").Subrouter()
	traderAPI.Use(AuthMiddleware(s.supabaseClient))
	traderAPI.Use(TierMiddleware(s.supabaseClient))

	traderAPI.HandleFunc("/{id}/start", s.traderHandler.StartTrader).Methods("POST")
	traderAPI.HandleFunc("/{id}/stop", s.traderHandler.StopTrader).Methods("POST")
	traderAPI.HandleFunc("/{id}/reload", s.traderHandler.ReloadTrader).Methods("POST")
	traderAPI.HandleFunc("/{id}/status", s.traderHandler.GetTraderStatus).Methods("GET")
	traderAPI.HandleFunc("/active", s.traderHandler.ListActiveTraders).Methods("GET")
	traderAPI.HandleFunc("/metrics", s.traderHandler.GetManagerMetrics).Methods("GET")

	// Store the router
	s.router = r

	// Create CORS handler (will be applied in HTTP server)
	s.corsHandler = cors.New(cors.Options{
		AllowedOrigins:   []string{"*"}, // Configure based on environment
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	})
}

// Start starts the HTTP server and all engines
func (s *Server) Start() error {
	log.Printf("[Server] Starting server on %s", s.httpServer.Addr)
	log.Printf("[Server] Environment: %s", s.config.Environment)
	log.Printf("[Server] Version: %s", s.config.Version)

	// Test Supabase connection
	if err := s.supabaseClient.HealthCheck(); err != nil {
		log.Printf("[Server] Warning: Supabase health check failed: %v", err)
	} else {
		log.Printf("[Server] ✅ Supabase connection OK")
	}

	// Bootstrap kline cache with historical data (one-time cost on startup)
	log.Printf("[Server] 🔄 Bootstrapping kline cache...")
	symbols, err := s.binanceClient.GetTopSymbols(context.Background(), s.config.SymbolCount, s.config.MinVolume)
	if err != nil {
		return fmt.Errorf("failed to get symbols for bootstrap: %w", err)
	}
	log.Printf("[Server] Retrieved %d symbols for bootstrap", len(symbols))

	// Define all intervals we want to cache
	intervals := []string{"1m", "5m", "15m", "1h", "4h", "1d"}
	log.Printf("[Server] Bootstrapping cache for %d intervals: %v", len(intervals), intervals)

	// Fetch historical klines for all intervals
	for _, interval := range intervals {
		log.Printf("[Server] Fetching %s klines for %d symbols...", interval, len(symbols))
		klineData, err := s.binanceClient.GetMultipleKlines(context.Background(), symbols, interval, 500)
		if err != nil {
			return fmt.Errorf("failed to fetch %s klines for bootstrap: %w", interval, err)
		}

		// Populate cache for this interval
		for symbol, klines := range klineData {
			s.klineCache.Set(symbol, interval, klines)
		}
		log.Printf("[Server] ✅ Cached %s klines for %d symbols", interval, len(klineData))
	}
	log.Printf("[Server] ✅ Kline cache bootstrapped: %d symbols × %d intervals = %d total klines", len(symbols), len(intervals), s.klineCache.Size())

	// Start WebSocket connection for real-time updates on all intervals
	log.Printf("[Server] 🔄 Connecting to Binance WebSocket...")
	if err := s.wsClient.Connect(symbols, intervals); err != nil {
		return fmt.Errorf("failed to connect WebSocket: %w", err)
	}
	log.Printf("[Server] ✅ WebSocket connected and streaming %d symbols × %d intervals = %d streams", len(symbols), len(intervals), len(symbols)*len(intervals))

	// Start Event Bus
	if err := s.eventBus.Start(); err != nil {
		return fmt.Errorf("failed to start event bus: %w", err)
	}

	// Load traders from database
	log.Printf("[Server] Loading traders from database...")
	if err := s.traderManager.LoadTradersFromDB(); err != nil {
		// Log warning but don't fail server startup (graceful degradation)
		log.Printf("[Server] ⚠️  Warning: Failed to load traders from DB: %v", err)
	}

	// Start polling for trader changes (deletions)
	s.traderManager.StartPolling(5 * time.Second) // Poll every 5 seconds
	log.Printf("[Server] ✅ Trader deletion detection enabled")

	// Start Analysis Engine (if available)
	if s.analysisEngine != nil {
		if err := s.analysisEngine.Start(); err != nil {
			return fmt.Errorf("failed to start analysis engine: %w", err)
		}
	}

	// Start Monitoring Engine (if available)
	if s.monitoringEngine != nil {
		if err := s.monitoringEngine.Start(); err != nil {
			return fmt.Errorf("failed to start monitoring engine: %w", err)
		}
	}

	// Start Trader Executor
	if err := s.traderExecutor.Start(); err != nil {
		return fmt.Errorf("failed to start trader executor: %w", err)
	}

	// Start Candle Scheduler (last, as it triggers events)
	if err := s.candleScheduler.Start(); err != nil {
		return fmt.Errorf("failed to start candle scheduler: %w", err)
	}

	log.Printf("[Server] ✅ All engines started successfully")

	// Start HTTP server
	return s.httpServer.ListenAndServe()
}

// Shutdown gracefully shuts down the server
func (s *Server) Shutdown(ctx context.Context) error {
	log.Printf("[Server] Shutting down...")

	// Shutdown in reverse order of startup

	// 1. Shutdown WebSocket connection (stop receiving updates)
	log.Printf("[Server] Shutting down WebSocket connection...")
	if err := s.wsClient.Close(); err != nil {
		log.Printf("[Server] Warning: WebSocket shutdown error: %v", err)
	}

	// 2. Shutdown trader manager (stop accepting new traders)
	log.Printf("[Server] Shutting down trader manager...")
	if err := s.traderManager.Shutdown(30 * time.Second); err != nil {
		log.Printf("[Server] Warning: Trader manager shutdown error: %v", err)
	}

	// 3. Shutdown candle scheduler (stop generating events)
	log.Printf("[Server] Shutting down candle scheduler...")
	if err := s.candleScheduler.Stop(); err != nil {
		log.Printf("[Server] Warning: Candle scheduler shutdown error: %v", err)
	}

	// 4. Shutdown trader executor (stop processing traders)
	log.Printf("[Server] Shutting down trader executor...")
	if err := s.traderExecutor.Stop(); err != nil {
		log.Printf("[Server] Warning: Trader executor shutdown error: %v", err)
	}

	// 4. Shutdown monitoring engine (if available)
	if s.monitoringEngine != nil {
		log.Printf("[Server] Shutting down monitoring engine...")
		if err := s.monitoringEngine.Stop(); err != nil {
			log.Printf("[Server] Warning: Monitoring engine shutdown error: %v", err)
		}
	}

	// 5. Shutdown analysis engine (if available)
	if s.analysisEngine != nil {
		log.Printf("[Server] Shutting down analysis engine...")
		if err := s.analysisEngine.Stop(); err != nil {
			log.Printf("[Server] Warning: Analysis engine shutdown error: %v", err)
		}
	}

	// 6. Shutdown event bus (close all channels)
	log.Printf("[Server] Shutting down event bus...")
	if err := s.eventBus.Stop(); err != nil {
		log.Printf("[Server] Warning: Event bus shutdown error: %v", err)
	}

	// 7. Shutdown HTTP server
	log.Printf("[Server] Shutting down HTTP server...")
	if err := s.httpServer.Shutdown(ctx); err != nil {
		log.Printf("[Server] Warning: HTTP server shutdown error: %v", err)
		return err
	}

	log.Printf("[Server] ✅ Shutdown complete")
	return nil
}

// Handler functions

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	health := types.HealthStatus{
		Status:    "healthy",
		Timestamp: time.Now(),
		Version:   s.config.Version,
		Uptime:    time.Since(s.startTime).Seconds(),
	}

	respondJSON(w, http.StatusOK, health)
}

func (s *Server) handleGetSymbols(w http.ResponseWriter, r *http.Request) {
	symbols, err := s.binanceClient.GetTopSymbols(r.Context(), s.config.SymbolCount, s.config.MinVolume)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch symbols", err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"symbols": symbols,
		"count":   len(symbols),
	})
}

func (s *Server) handleGetKlines(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	symbol := vars["symbol"]
	interval := vars["interval"]

	limit := 250 // Default
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		fmt.Sscanf(limitStr, "%d", &limit)
	}

	klines, err := s.binanceClient.GetKlines(r.Context(), symbol, interval, limit)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch klines", err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"symbol":   symbol,
		"interval": interval,
		"klines":   klines,
		"count":    len(klines),
	})
}

func (s *Server) handleGetTraders(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userId")

	if userID == "" {
		// Get built-in traders
		traders, err := s.supabaseClient.GetBuiltInTraders(r.Context())
		if err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to fetch traders", err)
			return
		}
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"traders": traders,
			"count":   len(traders),
		})
		return
	}

	// Get user-specific traders
	traders, err := s.supabaseClient.GetTraders(r.Context(), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch traders", err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"traders": traders,
		"count":   len(traders),
	})
}

func (s *Server) handleGetTrader(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	traderID := vars["id"]

	// TODO: Implement GetTrader in supabase client
	respondError(w, http.StatusNotImplemented, "Not implemented", nil)
	_ = traderID
}

func (s *Server) handleCreateSignal(w http.ResponseWriter, r *http.Request) {
	var signal types.Signal
	if err := json.NewDecoder(r.Body).Decode(&signal); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	// Set timestamp if not provided
	if signal.Timestamp.IsZero() {
		signal.Timestamp = time.Now()
	}

	if err := s.supabaseClient.CreateSignal(r.Context(), &signal); err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to create signal", err)
		return
	}

	respondJSON(w, http.StatusCreated, signal)
}

func (s *Server) handleGetSignals(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement GetSignals in supabase client
	respondError(w, http.StatusNotImplemented, "Not implemented", nil)
}

type ExecuteFilterRequest struct {
	Code       string             `json:"code"`
	MarketData types.MarketData   `json:"marketData"`
}

func (s *Server) handleExecuteFilter(w http.ResponseWriter, r *http.Request) {
	var req ExecuteFilterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	// Execute filter with timeout
	result, err := s.yaegiExecutor.ExecuteFilterWithTimeout(req.Code, &req.MarketData, 1*time.Second)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Filter execution failed", err)
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"matched": result,
		"symbol":  req.MarketData.Symbol,
	})
}

type ValidateCodeRequest struct {
	Code string `json:"code"`
}

func (s *Server) handleValidateCode(w http.ResponseWriter, r *http.Request) {
	var req ValidateCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body", err)
		return
	}

	if err := s.yaegiExecutor.ValidateCode(req.Code); err != nil {
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"valid":  false,
			"error":  err.Error(),
		})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"valid": true,
	})
}

// Helper functions

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, message string, err error) {
	errMsg := ""
	if err != nil {
		errMsg = err.Error()
		log.Printf("Error: %s - %v\n", message, err)
	}

	response := types.ErrorResponse{
		Error:   message,
		Message: errMsg,
		Code:    status,
	}

	respondJSON(w, status, response)
}
