package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/yourusername/aitrader-tui/internal/api"
	"github.com/yourusername/aitrader-tui/internal/engine"
)

// runDaemon starts the application in daemon mode (headless, cloud)
func runDaemon() error {
	log.Info().Msg("Starting in daemon mode (Fly.io)")

	// 1. Load cloud configuration
	cfg := loadConfig()
	cfg.Mode = engine.ModeDaemon

	// Override with Fly.io specific config
	if flyAppName := os.Getenv("FLY_APP_NAME"); flyAppName != "" {
		cfg.MachineID = flyAppName
		log.Info().Str("app_name", flyAppName).Msg("Running on Fly.io")
	}

	// 2. Initialize trading engine
	eng := engine.New(cfg)

	if err := eng.Start(); err != nil {
		return err
	}
	defer eng.Stop()

	// 3. Start HTTP API for monitoring
	apiServer := api.NewServer(eng, ":8080")
	go func() {
		if err := apiServer.Start(); err != nil && err != http.ErrServerClosed {
			log.Error().Err(err).Msg("API server error")
		}
	}()

	// 4. Setup graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	log.Info().Msg("Daemon is running. Waiting for shutdown signal...")

	// Wait for shutdown signal
	<-sigChan

	log.Info().Msg("Shutdown signal received, initiating graceful shutdown...")

	// 5. Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Shutdown HTTP server
	if err := apiServer.Shutdown(ctx); err != nil {
		log.Error().Err(err).Msg("Error shutting down API server")
	}

	// Engine will be stopped by defer

	log.Info().Msg("Daemon shutdown complete")

	return nil
}
