package deploy

import (
	"fmt"
	"os"
	"os/exec"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/yourusername/aitrader-tui/internal/engine"
)

// DeploymentInfo contains information about a deployment
type DeploymentInfo struct {
	AppName    string
	URL        string
	DeployedAt time.Time
	Status     string
}

// Deployer handles Fly.io deployments
type Deployer struct {
}

// NewDeployer creates a new deployer
func NewDeployer() *Deployer {
	return &Deployer{}
}

// IsAuthenticated checks if user is authenticated with Fly.io
func (d *Deployer) IsAuthenticated() bool {
	cmd := exec.Command("flyctl", "auth", "whoami")
	err := cmd.Run()
	return err == nil
}

// Authenticate authenticates the user with Fly.io
func (d *Deployer) Authenticate() error {
	log.Info().Msg("Opening Fly.io authentication...")

	cmd := exec.Command("flyctl", "auth", "login")
	cmd.Stdin = nil
	cmd.Stdout = nil
	cmd.Stderr = nil

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("authentication failed: %w", err)
	}

	return nil
}

// Deploy deploys the application to Fly.io
func (d *Deployer) Deploy(cfg engine.Config) (*DeploymentInfo, error) {
	// 1. Generate app name
	appName := generateAppName(cfg.UserID)
	log.Info().Str("app_name", appName).Msg("Creating Fly.io app")

	// 2. Create app (if not exists)
	createCmd := exec.Command("flyctl", "apps", "create", appName, "--region", "iad")
	if output, err := createCmd.CombinedOutput(); err != nil {
		// App might already exist, that's okay
		log.Debug().Str("output", string(output)).Msg("App create output")
	}

	// 3. Set secrets
	log.Info().Msg("Setting environment variables...")
	secrets := map[string]string{
		"USER_ID":            cfg.UserID,
		"SUPABASE_URL":       cfg.SupabaseURL,
		"SUPABASE_ANON_KEY":  cfg.SupabaseAnonKey,
		"BINANCE_API_KEY":    cfg.BinanceAPIKey,
		"BINANCE_SECRET_KEY": cfg.BinanceSecretKey,
		"MODE":               "daemon",
	}

	for key, value := range secrets {
		if value != "" {
			cmd := exec.Command("flyctl", "secrets", "set", fmt.Sprintf("%s=%s", key, value), "--app", appName)
			if err := cmd.Run(); err != nil {
				log.Warn().Err(err).Str("key", key).Msg("Failed to set secret")
			}
		}
	}

	// 4. Generate fly.toml
	if err := d.generateFlyToml(appName); err != nil {
		return nil, fmt.Errorf("failed to generate fly.toml: %w", err)
	}

	// 5. Deploy
	log.Info().Msg("Building and deploying...")
	deployCmd := exec.Command("flyctl", "deploy", "--app", appName)
	if output, err := deployCmd.CombinedOutput(); err != nil {
		log.Error().Str("output", string(output)).Msg("Deployment failed")
		return nil, fmt.Errorf("deployment failed: %w", err)
	}

	// 6. Return deployment info
	return &DeploymentInfo{
		AppName:    appName,
		URL:        fmt.Sprintf("https://%s.fly.dev", appName),
		DeployedAt: time.Now(),
		Status:     "deployed",
	}, nil
}

// generateFlyToml generates the fly.toml configuration file
func (d *Deployer) generateFlyToml(appName string) error {
	template := fmt.Sprintf(`app = "%s"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile.daemon"

[env]
  MODE = "daemon"

[[vm]]
  memory = '512mb'
  cpu_kind = 'shared'
  cpus = 1

[[services]]
  internal_port = 8080
  protocol = "tcp"

  [[services.ports]]
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443
`, appName)

	// Write to fly.toml file
	if err := writeFile("fly.toml", []byte(template), 0644); err != nil {
		return fmt.Errorf("failed to write fly.toml: %w", err)
	}

	log.Info().Msg("Generated fly.toml successfully")

	return nil
}

// generateAppName creates a unique app name
func generateAppName(userID string) string {
	// Hash userID for privacy and handle short IDs
	sanitizedID := sanitizeUserID(userID)
	timestamp := time.Now().Unix()
	return fmt.Sprintf("aitrader-%s-%d", sanitizedID, timestamp)
}

// sanitizeUserID creates a safe identifier from userID
func sanitizeUserID(userID string) string {
	if userID == "" {
		return "user"
	}

	// Use first 8 chars if available, otherwise pad/truncate
	if len(userID) >= 8 {
		return userID[:8]
	}

	// For short IDs, pad with hash to ensure uniqueness
	return fmt.Sprintf("%s%08x", userID, hashString(userID))[:8]
}

// hashString creates a simple hash of a string
func hashString(s string) uint32 {
	var hash uint32 = 0
	for _, c := range s {
		hash = hash*31 + uint32(c)
	}
	return hash
}

// writeFile is a helper to write files with proper error handling
func writeFile(filename string, data []byte, perm os.FileMode) error {
	return os.WriteFile(filename, data, perm)
}
