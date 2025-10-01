package logger

import (
	"os"
	"strings"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// Setup initializes the global logger with the specified level
func Setup(level string) {
	// Configure zerolog with timestamps in RFC3339 format
	zerolog.TimeFieldFormat = time.RFC3339

	// Set log level
	switch strings.ToLower(level) {
	case "debug":
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	case "info":
		zerolog.SetGlobalLevel(zerolog.InfoLevel)
	case "warn":
		zerolog.SetGlobalLevel(zerolog.WarnLevel)
	case "error":
		zerolog.SetGlobalLevel(zerolog.ErrorLevel)
	default:
		zerolog.SetGlobalLevel(zerolog.InfoLevel)
	}

	// Use console writer for human-readable output in development
	if os.Getenv("ENV") == "development" {
		log.Logger = log.Output(zerolog.ConsoleWriter{
			Out:        os.Stdout,
			TimeFormat: time.RFC3339,
		})
	} else {
		// JSON output for production
		log.Logger = zerolog.New(os.Stdout).With().Timestamp().Logger()
	}

	log.Info().
		Str("level", level).
		Msg("Logger initialized")
}

// WithTimestamp returns a logger with timestamp in RFC3339 format
func WithTimestamp() zerolog.Logger {
	return log.With().Timestamp().Logger()
}

// WithTrader returns a logger with trader context
func WithTrader(traderID string) zerolog.Logger {
	return log.With().
		Timestamp().
		Str("trader_id", traderID).
		Logger()
}

// WithSignal returns a logger with signal context
func WithSignal(signalID string) zerolog.Logger {
	return log.With().
		Timestamp().
		Str("signal_id", signalID).
		Logger()
}

// WithPosition returns a logger with position context
func WithPosition(positionID string) zerolog.Logger {
	return log.With().
		Timestamp().
		Str("position_id", positionID).
		Logger()
}

// WithComponent returns a logger with component context
func WithComponent(component string) zerolog.Logger {
	return log.With().
		Timestamp().
		Str("component", component).
		Logger()
}
