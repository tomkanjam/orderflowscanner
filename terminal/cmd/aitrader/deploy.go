package main

import (
	"github.com/rs/zerolog/log"
	"github.com/yourusername/aitrader-tui/internal/deploy"
)

// deployToCloud handles one-click deployment to Fly.io
func deployToCloud() error {
	log.Info().Msg("🚀 Starting deployment to Fly.io...")

	// 1. Check Fly.io authentication
	deployer := deploy.NewDeployer()

	if !deployer.IsAuthenticated() {
		log.Info().Msg("Authenticating with Fly.io...")
		if err := deployer.Authenticate(); err != nil {
			return err
		}
	}

	// 2. Load local configuration
	cfg := loadConfig()

	// 3. Deploy to Fly.io
	deployInfo, err := deployer.Deploy(cfg)
	if err != nil {
		return err
	}

	log.Info().
		Str("app_name", deployInfo.AppName).
		Str("url", deployInfo.URL).
		Msg("✅ Deployment complete!")

	return nil
}

// monitorCloud connects to a cloud instance for monitoring
func monitorCloud() error {
	log.Info().Msg("Connecting to cloud instance for monitoring...")

	// This will be implemented to:
	// 1. Connect to cloud HTTP API
	// 2. Subscribe to WebSocket updates
	// 3. Display TUI with cloud data
	// 4. Allow sending commands to cloud

	log.Warn().Msg("Cloud monitoring not yet implemented")

	return nil
}
