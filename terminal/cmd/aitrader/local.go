package main

import (
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/rs/zerolog/log"
	"github.com/yourusername/aitrader-tui/internal/engine"
	"github.com/yourusername/aitrader-tui/internal/tui"
)

// runLocal starts the application in local TUI mode
func runLocal() error {
	log.Info().Msg("Starting in local mode (TUI)")

	// 1. Load configuration from environment
	cfg := loadConfig()
	cfg.Mode = engine.ModeLocal

	// 2. Initialize trading engine
	eng := engine.New(cfg)

	// Start engine in background
	if err := eng.Start(); err != nil {
		return err
	}
	defer eng.Stop()

	// 3. Create TUI model with engine
	m := tui.NewWithEngine(eng)

	// 4. Run Bubbletea program
	p := tea.NewProgram(
		m,
		tea.WithAltScreen(),
		tea.WithMouseCellMotion(),
	)

	if _, err := p.Run(); err != nil {
		return err
	}

	return nil
}

// loadConfig loads configuration from environment variables
func loadConfig() engine.Config {
	cfg := engine.Config{
		UserID:           getEnv("USER_ID", ""),
		DatabaseURL:      getEnv("DATABASE_URL", ""),
		BinanceAPIKey:    getEnv("BINANCE_API_KEY", ""),
		BinanceSecretKey: getEnv("BINANCE_SECRET_KEY", ""),
		SupabaseURL:      getEnv("SUPABASE_URL", ""),
		SupabaseAnonKey:  getEnv("SUPABASE_ANON_KEY", ""),
		PaperTradingOnly: getEnv("PAPER_TRADING", "true") == "true",
		MachineID:        getEnv("MACHINE_ID", "local"),
		LogLevel:         getEnv("LOG_LEVEL", "info"),
	}

	// Validate required fields
	if err := validateConfig(cfg); err != nil {
		log.Fatal().Err(err).Msg("Invalid configuration")
	}

	return cfg
}

// validateConfig validates the configuration
func validateConfig(cfg engine.Config) error {
	// UserID is required
	if cfg.UserID == "" {
		return fmt.Errorf("USER_ID environment variable is required")
	}

	// For non-paper trading, API keys are required
	if !cfg.PaperTradingOnly {
		if cfg.BinanceAPIKey == "" {
			return fmt.Errorf("BINANCE_API_KEY is required when paper trading is disabled")
		}
		if cfg.BinanceSecretKey == "" {
			return fmt.Errorf("BINANCE_SECRET_KEY is required when paper trading is disabled")
		}
	}

	// Warn about missing optional fields
	if cfg.SupabaseURL == "" {
		log.Warn().Msg("SUPABASE_URL not set - database features will be limited")
	}
	if cfg.DatabaseURL == "" {
		log.Warn().Msg("DATABASE_URL not set - will use default SQLite")
	}

	return nil
}

// getEnv gets an environment variable with a default value
func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
