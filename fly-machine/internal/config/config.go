package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/yourusername/trader-machine/internal/types"
)

const (
	defaultLogLevel = "info"
	defaultVersion  = "v1.0.0"
)

// Load loads configuration from environment variables
func Load() (*types.Config, error) {
	cfg := &types.Config{
		UserID:           os.Getenv("USER_ID"),
		SupabaseURL:      os.Getenv("SUPABASE_URL"),
		SupabaseAnonKey:  os.Getenv("SUPABASE_ANON_KEY"),
		MachineID:        os.Getenv("MACHINE_ID"),
		DatabaseURL:      os.Getenv("DATABASE_URL"),
		Version:          getEnvOrDefault("VERSION", defaultVersion),
		LogLevel:         getEnvOrDefault("LOG_LEVEL", defaultLogLevel),
		PaperTradingOnly: getEnvBool("PAPER_TRADING_ONLY", true),
		BinanceAPIKey:    os.Getenv("BINANCE_API_KEY"),
		BinanceSecretKey: os.Getenv("BINANCE_SECRET_KEY"),
	}

	// Validate required fields
	if err := validate(cfg); err != nil {
		return nil, err
	}

	return cfg, nil
}

// validate checks that all required configuration is present
func validate(cfg *types.Config) error {
	if cfg.UserID == "" {
		return fmt.Errorf("USER_ID is required")
	}

	if cfg.SupabaseURL == "" {
		return fmt.Errorf("SUPABASE_URL is required")
	}

	if cfg.SupabaseAnonKey == "" {
		return fmt.Errorf("SUPABASE_ANON_KEY is required")
	}

	if cfg.DatabaseURL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}

	return nil
}

// getEnvOrDefault returns environment variable value or default
func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// getEnvBool returns environment variable as boolean or default
func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		result, err := strconv.ParseBool(value)
		if err != nil {
			return defaultValue
		}
		return result
	}
	return defaultValue
}
