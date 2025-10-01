package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/yourusername/aitrader-tui/internal/engine"
)

const version = "1.0.0"

func init() {
	// Setup logger
	setupLogger()
}

func main() {
	// Parse command-line flags
	daemon := flag.Bool("daemon", false, "Run as daemon (cloud mode)")
	deploy := flag.Bool("deploy", false, "Deploy to Fly.io")
	monitor := flag.Bool("monitor", false, "Monitor cloud instance")
	showVersion := flag.Bool("version", false, "Show version information")
	flag.Parse()

	// Show version if requested
	if *showVersion {
		fmt.Printf("aitrader version %s\n", version)
		os.Exit(0)
	}

	// Detect execution mode
	mode := engine.DetectMode(*daemon, *deploy, *monitor)

	// Route to appropriate execution mode
	switch mode {
	case engine.ModeLocal:
		if err := runLocal(); err != nil {
			fmt.Printf("Error running in local mode: %v\n", err)
			os.Exit(1)
		}

	case engine.ModeDaemon:
		if err := runDaemon(); err != nil {
			fmt.Printf("Error running in daemon mode: %v\n", err)
			os.Exit(1)
		}

	case engine.ModeDeploy:
		if err := deployToCloud(); err != nil {
			fmt.Printf("Error deploying to cloud: %v\n", err)
			os.Exit(1)
		}

	case engine.ModeMonitor:
		if err := monitorCloud(); err != nil {
			fmt.Printf("Error monitoring cloud: %v\n", err)
			os.Exit(1)
		}

	default:
		fmt.Printf("Unknown mode: %s\n", mode)
		os.Exit(1)
	}
}

// setupLogger configures the global logger
func setupLogger() {
	// Check if running in daemon mode (production)
	if os.Getenv("FLY_APP_NAME") != "" || os.Getenv("MODE") == "daemon" {
		// Production: JSON logging
		zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	} else {
		// Development: Pretty console output
		log.Logger = log.Output(zerolog.ConsoleWriter{
			Out:        os.Stderr,
			TimeFormat: "15:04:05",
		})
	}

	// Set log level from environment
	level := os.Getenv("LOG_LEVEL")
	switch level {
	case "debug":
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	case "warn":
		zerolog.SetGlobalLevel(zerolog.WarnLevel)
	case "error":
		zerolog.SetGlobalLevel(zerolog.ErrorLevel)
	default:
		zerolog.SetGlobalLevel(zerolog.InfoLevel)
	}
}
