package config

import (
	"encoding/base64"
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config holds all application configuration
type Config struct {
	// Server settings
	ServerPort int
	ServerHost string

	// Binance settings
	BinanceAPIURL    string
	BinanceWSURL     string
	SymbolCount      int
	MinVolume        float64
	KlineInterval    string
	ScreeningInterval time.Duration

	// Supabase settings
	SupabaseURL        string
	SupabaseServiceKey string
	SupabaseAnonKey    string

	// Braintrust settings (observability)
	BraintrustAPIKey   string
	BraintrustProjectID string

	// Machine settings (for Fly.io deployment)
	MachineID     string
	UserID        string
	MachineRegion string
	MachineCPUs   int
	MachineMemory int

	// Application settings
	Environment string
	Version     string
	LogLevel    string
}

// Load reads configuration from environment variables
func Load() (*Config, error) {
	// WORKAROUND: Fly.io strips JWT values from env vars, so we base64 encode them
	// Try to get the base64-encoded version first, fallback to direct
	supabaseServiceKey := getEnv("SUPABASE_SERVICE_KEY", "")
	if supabaseServiceKey == "" {
		// Try base64 encoded version
		if b64Key := getEnv("SUPABASE_SERVICE_KEY_B64", ""); b64Key != "" {
			decoded, err := base64Decode(b64Key)
			if err == nil {
				supabaseServiceKey = decoded
			}
		}
	}

	cfg := &Config{
		// Defaults
		ServerPort:        getEnvAsInt("PORT", 8080),
		ServerHost:        getEnv("HOST", "0.0.0.0"),
		BinanceAPIURL:     getEnv("BINANCE_API_URL", "https://api.binance.com"),
		BinanceWSURL:      getEnv("BINANCE_WS_URL", "wss://stream.binance.com:9443"),
		SymbolCount:       getEnvAsInt("SYMBOL_COUNT", 100),
		MinVolume:         getEnvAsFloat("MIN_VOLUME", 100000),
		KlineInterval:     getEnv("KLINE_INTERVAL", "5m"),
		ScreeningInterval: getEnvAsDuration("SCREENING_INTERVAL_MS", 60000) * time.Millisecond,

		SupabaseURL:        getEnv("SUPABASE_URL", ""),
		SupabaseServiceKey: supabaseServiceKey, // Use decoded value
		SupabaseAnonKey:    getEnv("SUPABASE_ANON_KEY", ""),

		BraintrustAPIKey:   getEnv("BRAINTRUST_API_KEY", ""),
		BraintrustProjectID: getEnv("BRAINTRUST_PROJECT_ID", ""),

		MachineID:     getEnv("MACHINE_ID", fmt.Sprintf("machine_%d", time.Now().Unix())),
		UserID:        getEnv("USER_ID", ""),
		MachineRegion: getEnv("MACHINE_REGION", "sin"),
		MachineCPUs:   getEnvAsInt("MACHINE_CPUS", 1),
		MachineMemory: getEnvAsInt("MACHINE_MEMORY", 256),

		Environment: getEnv("ENVIRONMENT", "development"),
		Version:     getEnv("VERSION", "1.0.0"),
		LogLevel:    getEnv("LOG_LEVEL", "info"),
	}

	// Validate required fields
	if cfg.SupabaseURL == "" {
		return nil, fmt.Errorf("SUPABASE_URL is required")
	}
	if cfg.SupabaseServiceKey == "" {
		return nil, fmt.Errorf("SUPABASE_SERVICE_KEY is required")
	}

	return cfg, nil
}

// Helper functions to get environment variables with defaults
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvAsInt(key string, defaultValue int) int {
	valueStr := os.Getenv(key)
	if valueStr == "" {
		return defaultValue
	}
	value, err := strconv.Atoi(valueStr)
	if err != nil {
		return defaultValue
	}
	return value
}

func getEnvAsFloat(key string, defaultValue float64) float64 {
	valueStr := os.Getenv(key)
	if valueStr == "" {
		return defaultValue
	}
	value, err := strconv.ParseFloat(valueStr, 64)
	if err != nil {
		return defaultValue
	}
	return value
}

func getEnvAsDuration(key string, defaultValue int) time.Duration {
	valueStr := os.Getenv(key)
	if valueStr == "" {
		return time.Duration(defaultValue)
	}
	value, err := strconv.Atoi(valueStr)
	if err != nil {
		return time.Duration(defaultValue)
	}
	return time.Duration(value)
}

// IsDevelopment returns true if running in development mode
func (c *Config) IsDevelopment() bool {
	return c.Environment == "development"
}

// IsProduction returns true if running in production mode
func (c *Config) IsProduction() bool {
	return c.Environment == "production"
}

// GetOpenRouterAPIKey returns the OpenRouter API key from environment
func (c *Config) GetOpenRouterAPIKey() string {
	return getEnv("OPENROUTER_API_KEY", "")
}

// base64Decode decodes a base64-encoded string
func base64Decode(encoded string) (string, error) {
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}
	return string(decoded), nil
}
