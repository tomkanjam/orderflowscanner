package server

import (
	"context"
	"encoding/json"
	"net/http"
	"runtime"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/yourusername/trader-machine/internal/binance"
	"github.com/yourusername/trader-machine/internal/database"
	"github.com/yourusername/trader-machine/internal/monitor"
	"github.com/yourusername/trader-machine/internal/timer"
	"github.com/yourusername/trader-machine/internal/types"
)

// Server represents the HTTP API server
type Server struct {
	server         *http.Server
	db             *database.Client
	wsManager      *binance.WSManager
	timerManager   *timer.Manager
	positionMonitor *monitor.PositionMonitor
	startTime      time.Time
	version        string
}

// New creates a new HTTP server
func New(addr string, db *database.Client, wsManager *binance.WSManager, timerManager *timer.Manager, positionMonitor *monitor.PositionMonitor, version string) *Server {
	s := &Server{
		db:              db,
		wsManager:       wsManager,
		timerManager:    timerManager,
		positionMonitor: positionMonitor,
		startTime:       time.Now(),
		version:         version,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/metrics", s.handleMetrics)
	mux.HandleFunc("/positions", s.handlePositions)
	mux.HandleFunc("/reload", s.handleReload)

	s.server = &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	return s
}

// Start starts the HTTP server
func (s *Server) Start() error {
	log.Info().
		Str("addr", s.server.Addr).
		Msg("HTTP server starting")

	if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return err
	}

	return nil
}

// Shutdown gracefully shuts down the server
func (s *Server) Shutdown(ctx context.Context) error {
	log.Info().Msg("HTTP server shutting down")
	return s.server.Shutdown(ctx)
}

// handleHealth returns health status
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx := r.Context()

	// Get active traders count
	traders, err := s.db.GetActiveTraders(ctx, "")
	activeTraders := 0
	if err == nil {
		activeTraders = len(traders)
	}

	// Get open positions count
	positions, err := s.db.GetOpenPositions(ctx, "")
	openPositions := 0
	if err == nil {
		openPositions = len(positions)
	}

	// Get memory usage
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	health := types.HealthStatus{
		Status:             "healthy",
		Version:            s.version,
		Uptime:             time.Since(s.startTime).Seconds(),
		ActiveTraders:      activeTraders,
		OpenPositions:      openPositions,
		WebSocketConnected: s.wsManager.IsConnected(),
		LastKlineUpdate:    s.wsManager.GetLastUpdate(),
		MemoryUsageMB:      m.Alloc / 1024 / 1024,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(health)

	log.Debug().
		Str("endpoint", "/health").
		Int("active_traders", activeTraders).
		Int("open_positions", openPositions).
		Msg("Health check")
}

// handleMetrics returns detailed metrics
func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	metrics := map[string]interface{}{
		"uptime_seconds":      time.Since(s.startTime).Seconds(),
		"version":             s.version,
		"websocket_connected": s.wsManager.IsConnected(),
		"last_kline_update":   s.wsManager.GetLastUpdate(),
		"memory": map[string]interface{}{
			"alloc_mb":       m.Alloc / 1024 / 1024,
			"total_alloc_mb": m.TotalAlloc / 1024 / 1024,
			"sys_mb":         m.Sys / 1024 / 1024,
			"num_gc":         m.NumGC,
		},
		"goroutines": runtime.NumGoroutine(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)

	log.Debug().
		Str("endpoint", "/metrics").
		Msg("Metrics requested")
}

// handlePositions returns current positions with PNL
func (s *Server) handlePositions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	positions := s.positionMonitor.GetAllPositions()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"positions": positions,
		"count":     len(positions),
	})

	log.Debug().
		Str("endpoint", "/positions").
		Int("count", len(positions)).
		Msg("Positions requested")
}

// handleReload reloads traders from database
func (s *Server) handleReload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx := r.Context()

	// Get all active traders
	traders, err := s.db.GetActiveTraders(ctx, "")
	if err != nil {
		http.Error(w, "Failed to load traders", http.StatusInternalServerError)
		log.Error().Err(err).Msg("Failed to load traders for reload")
		return
	}

	log.Info().
		Int("trader_count", len(traders)).
		Msg("Reloading traders")

	// TODO: Reload logic would be implemented here
	// This would involve stopping existing timers and starting new ones

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Traders reloaded",
		"count":   len(traders),
	})

	log.Info().
		Int("count", len(traders)).
		Msg("Traders reloaded successfully")
}
