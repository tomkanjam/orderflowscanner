package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/yourusername/aitrader-tui/internal/engine"
)

// Server provides HTTP API for cloud monitoring
type Server struct {
	engine *engine.Engine
	addr   string
	mux    *http.ServeMux
	server *http.Server
	apiKey string // Optional API key for authentication
}

// NewServer creates a new API server
func NewServer(eng *engine.Engine, addr string) *Server {
	s := &Server{
		engine: eng,
		addr:   addr,
		mux:    http.NewServeMux(),
		apiKey: getAPIKey(),
	}

	s.setupRoutes()
	return s
}

// getAPIKey retrieves the API key from environment
func getAPIKey() string {
	key := os.Getenv("API_KEY")
	if key != "" {
		log.Info().Msg("API authentication enabled")
	} else {
		log.Warn().Msg("API_KEY not set - authentication disabled (not recommended for production)")
	}
	return key
}

// setupRoutes configures all HTTP endpoints
func (s *Server) setupRoutes() {
	// Health check (no auth required)
	s.mux.HandleFunc("/health", s.handleHealth)

	// Protected endpoints
	s.mux.HandleFunc("/status", s.requireAuth(s.handleStatus))
	s.mux.HandleFunc("/api/markets", s.requireAuth(s.handleMarkets))
	s.mux.HandleFunc("/api/traders", s.requireAuth(s.handleTraders))
	s.mux.HandleFunc("/api/signals", s.requireAuth(s.handleSignals))
	s.mux.HandleFunc("/api/positions", s.requireAuth(s.handlePositions))
	s.mux.HandleFunc("/ws", s.requireAuth(s.handleWebSocket))
}

// requireAuth is a middleware that checks API key authentication
func (s *Server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Skip auth if no API key is configured
		if s.apiKey == "" {
			next(w, r)
			return
		}

		// Check Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Missing Authorization header", http.StatusUnauthorized)
			return
		}

		// Simple bearer token check
		expectedAuth := "Bearer " + s.apiKey
		if authHeader != expectedAuth {
			http.Error(w, "Invalid API key", http.StatusUnauthorized)
			return
		}

		// Auth successful
		next(w, r)
	}
}

// Start starts the HTTP server
func (s *Server) Start() error {
	log.Info().Str("addr", s.addr).Msg("Starting HTTP API server")

	s.server = &http.Server{
		Addr:         s.addr,
		Handler:      s.mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	return s.server.ListenAndServe()
}

// Shutdown gracefully shuts down the HTTP server
func (s *Server) Shutdown(ctx context.Context) error {
	if s.server == nil {
		return nil
	}

	log.Info().Msg("Shutting down HTTP API server...")

	if err := s.server.Shutdown(ctx); err != nil {
		return fmt.Errorf("failed to shutdown server: %w", err)
	}

	log.Info().Msg("HTTP API server stopped successfully")
	return nil
}

// Handlers

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "healthy",
		"time":   time.Now().Format(time.RFC3339),
	})
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	status := s.engine.GetStatus()
	json.NewEncoder(w).Encode(status)
}

func (s *Server) handleMarkets(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Return placeholder data until engine is fully implemented
	response := map[string]interface{}{
		"markets": []map[string]interface{}{
			{
				"symbol":    "BTCUSDT",
				"price":     43250.00,
				"change24h": 2.3,
				"volume24h": 2.3e9,
			},
			{
				"symbol":    "ETHUSDT",
				"price":     2340.00,
				"change24h": -0.8,
				"volume24h": 890e6,
			},
		},
		"timestamp": time.Now().Unix(),
	}

	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleTraders(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Return placeholder data until engine is fully implemented
	response := map[string]interface{}{
		"traders": []map[string]interface{}{
			{
				"id":     "trader-1",
				"name":   "RSI Divergence",
				"status": "active",
				"signals_count": 12,
			},
		},
		"timestamp": time.Now().Unix(),
	}

	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleSignals(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Return placeholder data until engine is fully implemented
	response := map[string]interface{}{
		"signals": []map[string]interface{}{
			{
				"id":         "signal-1",
				"symbol":     "ETHUSDT",
				"status":     "watching",
				"confidence": 78,
			},
		},
		"timestamp": time.Now().Unix(),
	}

	json.NewEncoder(w).Encode(response)
}

func (s *Server) handlePositions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Return placeholder data until engine is fully implemented
	response := map[string]interface{}{
		"positions": []map[string]interface{}{
			{
				"id":     "pos-1",
				"symbol": "BTCUSDT",
				"side":   "LONG",
				"pnl":    625.00,
				"pnl_pct": 3.0,
			},
		},
		"timestamp": time.Now().Unix(),
	}

	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	// TODO: Implement WebSocket for real-time updates
	http.Error(w, "WebSocket not yet implemented", http.StatusNotImplemented)
}
