package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/rs/cors"
	"github.com/vyx/go-screener/pkg/binance"
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
	corsHandler     *cors.Cors
	startTime       time.Time
}

// New creates a new server instance
func New(cfg *config.Config) (*Server, error) {
	// Initialize clients
	binanceClient := binance.NewClient(cfg.BinanceAPIURL)
	supabaseClient := supabase.NewClient(cfg.SupabaseURL, cfg.SupabaseServiceKey)

	// Initialize Yaegi executor
	executor, err := yaegi.NewExecutor()
	if err != nil {
		return nil, fmt.Errorf("failed to create yaegi executor: %w", err)
	}

	s := &Server{
		config:         cfg,
		binanceClient:  binanceClient,
		supabaseClient: supabaseClient,
		yaegiExecutor:  executor,
		startTime:      time.Now(),
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

// Start starts the HTTP server
func (s *Server) Start() error {
	log.Printf("Starting server on %s\n", s.httpServer.Addr)
	log.Printf("Environment: %s\n", s.config.Environment)
	log.Printf("Version: %s\n", s.config.Version)

	// Test Supabase connection
	if err := s.supabaseClient.HealthCheck(); err != nil {
		log.Printf("Warning: Supabase health check failed: %v\n", err)
	} else {
		log.Println("Supabase connection OK")
	}

	return s.httpServer.ListenAndServe()
}

// Shutdown gracefully shuts down the server
func (s *Server) Shutdown(ctx context.Context) error {
	log.Println("Shutting down server...")
	return s.httpServer.Shutdown(ctx)
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
	symbols, err := s.binanceClient.GetTopSymbols(s.config.SymbolCount, s.config.MinVolume)
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
	interval := types.KlineInterval(vars["interval"])

	limit := 250 // Default
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		fmt.Sscanf(limitStr, "%d", &limit)
	}

	klines, err := s.binanceClient.GetKlines(symbol, interval, limit)
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
		traders, err := s.supabaseClient.GetBuiltInTraders()
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
	traders, err := s.supabaseClient.GetTraders(userID)
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

	if err := s.supabaseClient.CreateSignal(&signal); err != nil {
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
	result, err := s.yaegiExecutor.ExecuteFilterWithTimeout(req.Code, &req.MarketData, 5*time.Second)
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
