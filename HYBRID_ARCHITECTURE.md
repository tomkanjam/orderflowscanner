# 🌟 Hybrid Local + Cloud Architecture

## The Ultimate Trading App: Run Anywhere, Deploy Anywhere

### 🎯 Vision

**Single Go Binary** that can:
1. ✅ Run locally with beautiful TUI
2. ✅ Deploy to Fly.io with one click
3. ✅ Monitor cloud from local TUI
4. ✅ Switch between modes seamlessly

## 🏗️ Architecture Design

### Unified Codebase Structure

```
aitrader/
├── cmd/
│   └── aitrader/
│       ├── main.go          # Entry point (mode detection)
│       ├── local.go         # Local mode with TUI
│       ├── daemon.go        # Cloud mode (headless)
│       └── deploy.go        # One-click deployment
│
├── internal/
│   ├── tui/                 # Terminal UI (local only)
│   │   ├── model.go
│   │   ├── update.go
│   │   ├── view.go
│   │   └── deploy_panel.go # NEW: Cloud deployment panel
│   │
│   ├── engine/              # Trading Engine (SHARED)
│   │   ├── websocket.go    # Binance WebSocket
│   │   ├── executor.go     # Signal execution
│   │   ├── trader.go       # Trade operations
│   │   ├── monitor.go      # Position monitoring
│   │   ├── timer.go        # Signal checks
│   │   └── reanalysis.go   # AI re-analysis
│   │
│   ├── storage/             # Data Layer (SHARED)
│   │   ├── interface.go    # Storage interface
│   │   ├── sqlite.go       # Local storage
│   │   └── supabase.go     # Cloud storage
│   │
│   ├── deploy/              # Fly.io Deployment
│   │   ├── client.go       # Fly.io API client
│   │   ├── template.go     # fly.toml generator
│   │   └── sync.go         # Config sync
│   │
│   └── api/                 # HTTP API (cloud monitoring)
│       ├── server.go
│       └── handlers.go
│
├── configs/
│   ├── fly.template.toml   # Fly.io template
│   └── .env.example
│
└── Makefile
```

## 🔄 Mode Detection & Execution

### Entry Point
```go
// cmd/aitrader/main.go
package main

import (
    "flag"
    "os"
)

func main() {
    // Command-line flags
    daemon := flag.Bool("daemon", false, "Run as daemon (cloud mode)")
    deploy := flag.Bool("deploy", false, "Deploy to Fly.io")
    monitor := flag.Bool("monitor", false, "Monitor cloud instance")
    flag.Parse()

    // Detect mode
    mode := detectMode(*daemon, *deploy, *monitor)

    switch mode {
    case ModeLocal:
        runLocal()      // TUI + Trading Engine
    case ModeDaemon:
        runDaemon()     // Headless + HTTP API
    case ModeDeploy:
        deployToCloud() // One-click deployment
    case ModeMonitor:
        monitorCloud()  // Remote monitoring
    }
}

func detectMode(daemon, deploy, monitor bool) Mode {
    // Check environment
    if os.Getenv("FLY_APP_NAME") != "" {
        return ModeDaemon // Running on Fly.io
    }

    // Check flags
    if deploy {
        return ModeDeploy
    }
    if monitor {
        return ModeMonitor
    }
    if daemon {
        return ModeDaemon
    }

    return ModeLocal // Default: TUI
}
```

### Local Mode (TUI)
```go
// cmd/aitrader/local.go
func runLocal() {
    // 1. Load local config
    cfg := loadConfig()

    // 2. Initialize storage (SQLite or Supabase)
    store := storage.NewLocal(cfg)

    // 3. Initialize trading engine
    engine := engine.New(store, cfg)
    engine.Start()

    // 4. Initialize TUI with engine
    m := tui.NewWithEngine(engine, store)

    // 5. Run Bubbletea
    p := tea.NewProgram(
        m,
        tea.WithAltScreen(),
        tea.WithMouseCellMotion(),
    )

    if _, err := p.Run(); err != nil {
        log.Fatal(err)
    }

    // 6. Graceful shutdown
    engine.Stop()
}
```

### Cloud Mode (Daemon)
```go
// cmd/aitrader/daemon.go
func runDaemon() {
    log.Info("Starting in daemon mode (Fly.io)")

    // 1. Load cloud config
    cfg := loadCloudConfig()

    // 2. Initialize storage (Supabase)
    store := storage.NewSupabase(cfg)

    // 3. Initialize trading engine (SAME as local!)
    engine := engine.New(store, cfg)
    engine.Start()

    // 4. Start HTTP API for monitoring
    api := api.NewServer(engine, store)
    go api.Start(":8080")

    // 5. Run forever
    select {}
}
```

## 🚀 One-Click Deployment

### Deployment Panel in TUI
```go
// internal/tui/deploy_panel.go
package tui

type DeployPanel struct {
    status       string // "local", "deploying", "deployed"
    cloudURL     string
    cloudStatus  string
    logs         []string
}

func (m Model) renderDeployPanel() string {
    title := "☁️ CLOUD DEPLOYMENT"

    content := ""

    switch m.deployPanel.status {
    case "local":
        content = `
Status: Running Locally

Deploy your traders to run 24/7 in the cloud:

┌────────────────────────────────────┐
│ [Enter] Deploy to Fly.io           │
│ [T] Test Configuration             │
│ [H] View Deployment Help           │
└────────────────────────────────────┘

Benefits:
✓ Runs 24/7 without your computer
✓ Ultra-low latency trading
✓ Automatic restarts on errors
✓ Monitor from anywhere
`

    case "deploying":
        content = `
🚀 Deploying to Fly.io...

` + strings.Join(m.deployPanel.logs, "\n") + `

Please wait...
`

    case "deployed":
        content = fmt.Sprintf(`
✅ Deployed Successfully!

Cloud URL: %s
Status: %s

┌────────────────────────────────────┐
│ [M] Open Monitoring Dashboard      │
│ [L] View Cloud Logs                │
│ [S] Stop Cloud Instance            │
│ [R] Redeploy                       │
└────────────────────────────────────┘

Your traders are running in the cloud!
Monitor them from this TUI or close it.
`, m.deployPanel.cloudURL, m.deployPanel.cloudStatus)
    }

    return renderPanel(title, content)
}
```

### Deployment Logic
```go
// cmd/aitrader/deploy.go
package main

import (
    "github.com/superfly/flyctl/api"
)

func deployToCloud() error {
    log.Info("🚀 Starting deployment to Fly.io...")

    // 1. Check Fly.io authentication
    if !isAuthenticated() {
        log.Info("Authenticating with Fly.io...")
        if err := authenticate(); err != nil {
            return err
        }
    }

    // 2. Load local traders configuration
    traders, err := loadLocalTraders()
    if err != nil {
        return err
    }

    // 3. Create Fly.io app (if not exists)
    appName := generateAppName()
    log.Info("Creating Fly.io app: " + appName)

    client := api.NewClient()
    app, err := client.CreateApp(appName, "iad")
    if err != nil {
        return err
    }

    // 4. Upload traders to Supabase
    log.Info("Uploading traders to Supabase...")
    if err := uploadTraders(traders); err != nil {
        return err
    }

    // 5. Set secrets
    log.Info("Setting environment variables...")
    secrets := map[string]string{
        "USER_ID":            cfg.UserID,
        "SUPABASE_URL":       cfg.SupabaseURL,
        "SUPABASE_ANON_KEY":  cfg.SupabaseKey,
        "BINANCE_API_KEY":    cfg.BinanceAPIKey,
        "BINANCE_SECRET_KEY": cfg.BinanceSecretKey,
        "MODE":               "daemon",
    }

    for key, value := range secrets {
        client.SetSecret(app.Name, key, value)
    }

    // 6. Generate fly.toml from template
    flyToml := generateFlyToml(app.Name)
    if err := writeFlyToml(flyToml); err != nil {
        return err
    }

    // 7. Build and deploy
    log.Info("Building and deploying...")
    cmd := exec.Command("fly", "deploy", "--app", app.Name)
    output, err := cmd.CombinedOutput()
    if err != nil {
        log.Error(string(output))
        return err
    }

    // 8. Wait for deployment
    log.Info("Waiting for deployment to complete...")
    time.Sleep(30 * time.Second)

    // 9. Verify deployment
    status, err := client.GetAppStatus(app.Name)
    if err != nil {
        return err
    }

    // 10. Save deployment info
    deployInfo := DeploymentInfo{
        AppName:    app.Name,
        URL:        fmt.Sprintf("https://%s.fly.dev", app.Name),
        DeployedAt: time.Now(),
        Status:     status,
    }

    saveDeploymentInfo(deployInfo)

    log.Info("✅ Deployment complete!")
    log.Info("Cloud URL: " + deployInfo.URL)

    return nil
}
```

## 🔧 Shared Trading Engine

### Engine Interface
```go
// internal/engine/engine.go
package engine

type Engine struct {
    storage      storage.Storage
    websocket    *WebSocketManager
    executor     *TradeExecutor
    monitor      *PositionMonitor
    timer        *TimerManager
    reanalysis   *ReanalysisManager
    mode         Mode // local or daemon
}

func New(store storage.Storage, cfg Config) *Engine {
    return &Engine{
        storage:    store,
        websocket:  NewWebSocketManager(cfg),
        executor:   NewTradeExecutor(cfg),
        monitor:    NewPositionMonitor(store),
        timer:      NewTimerManager(store),
        reanalysis: NewReanalysisManager(store),
        mode:       cfg.Mode,
    }
}

func (e *Engine) Start() error {
    // Start WebSocket
    if err := e.websocket.Connect(); err != nil {
        return err
    }

    // Load traders
    traders, err := e.storage.GetActiveTraders()
    if err != nil {
        return err
    }

    // Start timers for each trader
    for _, trader := range traders {
        e.timer.AddTrader(trader)
    }

    // Start position monitor
    e.monitor.Start()

    // Start re-analysis
    e.reanalysis.Start()

    return nil
}

func (e *Engine) Stop() {
    e.timer.StopAll()
    e.monitor.Stop()
    e.reanalysis.Stop()
    e.websocket.Close()
}

// Same engine, different UI:
// - Local: TUI displays engine state
// - Daemon: HTTP API exposes engine state
```

## 📊 Storage Abstraction

### Storage Interface
```go
// internal/storage/interface.go
package storage

type Storage interface {
    // Traders
    GetActiveTraders(userID string) ([]Trader, error)
    CreateTrader(trader *Trader) error
    UpdateTrader(trader *Trader) error

    // Signals
    GetSignals(traderID string) ([]Signal, error)
    CreateSignal(signal *Signal) error

    // Positions
    GetOpenPositions(userID string) ([]Position, error)
    CreatePosition(pos *Position) error
    UpdatePosition(pos *Position) error
}

// Local: SQLite implementation
type LocalStorage struct {
    db *sql.DB
}

// Cloud: Supabase implementation
type CloudStorage struct {
    client *supabase.Client
}
```

## 🌐 HTTP API for Cloud Monitoring

### API Server (Daemon Mode)
```go
// internal/api/server.go
package api

type Server struct {
    engine *engine.Engine
    store  storage.Storage
}

func (s *Server) Start(addr string) error {
    mux := http.NewServeMux()

    // Health check
    mux.HandleFunc("/health", s.handleHealth)

    // Engine status
    mux.HandleFunc("/status", s.handleStatus)

    // Live data
    mux.HandleFunc("/api/markets", s.handleMarkets)
    mux.HandleFunc("/api/traders", s.handleTraders)
    mux.HandleFunc("/api/signals", s.handleSignals)
    mux.HandleFunc("/api/positions", s.handlePositions)

    // WebSocket for real-time updates
    mux.HandleFunc("/ws", s.handleWebSocket)

    return http.ListenAndServe(addr, mux)
}
```

### TUI Monitoring Client
```go
// internal/tui/cloud_monitor.go
package tui

func (m *Model) connectToCloud() error {
    // Connect to cloud instance via WebSocket
    ws, err := websocket.Dial(m.cloudURL + "/ws")
    if err != nil {
        return err
    }

    // Subscribe to updates
    go func() {
        for {
            var update CloudUpdate
            if err := ws.ReadJSON(&update); err != nil {
                return
            }

            // Update TUI with cloud data
            m.updateFromCloud(update)
        }
    }()

    return nil
}
```

## 🔄 User Experience Flow

### Scenario 1: Local Trading
```bash
$ aitrader

# TUI opens
# User creates traders
# Tests strategies locally
# Monitors in real-time
# Closes app → trading stops
```

### Scenario 2: Deploy to Cloud
```bash
$ aitrader

# Press '7' → Cloud Deployment panel
# Press Enter → Deploy to Fly.io
# 60 seconds later → Deployed!
# Cloud URL shown
# User can close TUI → trading continues 24/7
```

### Scenario 3: Monitor Cloud from Local
```bash
$ aitrader --monitor

# TUI connects to cloud instance
# Shows live cloud data
# Can send commands to cloud
# Local UI, cloud execution
```

### Scenario 4: Switch Back to Local
```bash
$ aitrader

# Press '7' → Cloud panel
# Press 'S' → Stop cloud instance
# Press 'L' → Switch to local mode
# Trading engine moves back to local
```

## 📦 Deployment Template

### fly.toml Template
```toml
# configs/fly.template.toml
app = "{{APP_NAME}}"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile.daemon"

[[vm]]
  memory = '512mb'
  cpu_kind = 'shared'
  cpus = 1

[env]
  MODE = "daemon"

[[services]]
  internal_port = 8080
  protocol = "tcp"

  [[services.ports]]
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443
```

### Dockerfile.daemon
```dockerfile
FROM golang:1.21-alpine AS builder

WORKDIR /app
COPY . .

# Build in daemon mode
RUN go build -tags daemon -o aitrader ./cmd/aitrader

FROM alpine:latest
COPY --from=builder /app/aitrader /usr/local/bin/

# Run as daemon
CMD ["aitrader", "--daemon"]
```

## 🎯 Key Benefits

### For Users:
1. ✅ **Test Locally** - Risk-free strategy testing
2. ✅ **One-Click Deploy** - Production in 60 seconds
3. ✅ **Monitor Anywhere** - TUI or web dashboard
4. ✅ **Switch Easily** - Local ↔ Cloud seamless
5. ✅ **Cost Control** - Free local, paid cloud

### For Development:
1. ✅ **Single Codebase** - No duplication
2. ✅ **Same Behavior** - Identical trading logic
3. ✅ **Easy Testing** - Test locally, deploy confident
4. ✅ **Gradual Migration** - Start local, scale cloud
5. ✅ **Unified Updates** - Update once, works everywhere

## 🚀 Implementation Plan

### Phase 1: Restructure (2-3 hours)
- [x] Merge fly-machine + terminal codebases
- [ ] Create unified engine package
- [ ] Add mode detection
- [ ] Create storage abstraction

### Phase 2: Cloud Deployment (3-4 hours)
- [ ] Fly.io API client
- [ ] fly.toml template generator
- [ ] Deployment logic
- [ ] Config synchronization

### Phase 3: TUI Enhancement (2-3 hours)
- [ ] Add deployment panel (Panel 7)
- [ ] Cloud monitoring view
- [ ] Deploy progress tracking
- [ ] Cloud logs viewer

### Phase 4: HTTP API (2-3 hours)
- [ ] Status endpoints
- [ ] WebSocket streaming
- [ ] Command interface
- [ ] Monitoring dashboard

### Total: 9-13 hours for complete implementation

## 🎊 Result

**One application, infinite possibilities:**
- 💻 Desktop app for development
- ☁️ Cloud deployment for production
- 🔄 Seamless switching
- 📊 Unified monitoring
- 🚀 Professional infrastructure

**Want me to implement this unified architecture?**
