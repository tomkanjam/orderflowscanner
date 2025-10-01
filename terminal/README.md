# 🚀 AI Crypto Trader - Terminal UI

A professional terminal-based interface for AI-powered cryptocurrency trading. Built with [Bubbletea](https://github.com/charmbracelet/bubbletea) for a beautiful, responsive TUI experience.

![AI Crypto Trader TUI](https://img.shields.io/badge/Status-Alpha-yellow)
![Go Version](https://img.shields.io/badge/Go-1.21+-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## ✨ Features

### 📊 Real-Time Market Overview
- Live price updates for multiple symbols
- 24h price changes and volume
- ASCII sparkline charts
- Color-coded profit/loss indicators

### 🤖 Active Traders Management
- View all active trading strategies
- Monitor signal generation
- Track last execution times
- Enable/disable traders

### 🎯 Signal Monitoring
- Real-time signal triggers
- AI confidence levels with progress bars
- Signal status tracking (watching, position_open, closed)
- Entry price and current price comparison

### 📈 Position Tracking
- Live P&L calculations
- Stop-loss and take-profit levels
- Position-specific charts
- Both long and short positions

### 💭 AI Analysis Display
- Live streaming AI analysis
- Gemini-powered trading decisions
- Confidence meters
- Detailed reasoning

### 📝 Activity Logs
- Real-time event logging
- Color-coded log levels (INFO, WARN, ERROR, AI)
- Auto-scrolling log viewer
- Timestamp for each event

## 🎨 UI Highlights

- **Tokyo Night Theme** - Beautiful, easy-on-the-eyes color scheme
- **Keyboard Navigation** - Vim-like shortcuts for power users
- **Responsive Layout** - Adapts to terminal size
- **Focus Indicators** - Clear visual feedback
- **Status Badges** - Quick status identification

## 🚀 Quick Start

### Prerequisites
- Go 1.21 or higher
- A modern terminal with Unicode support

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/aitrader-tui
cd aitrader-tui/terminal

# Install dependencies
go mod download

# Build the binary
go build -o aitrader ./cmd/aitrader

# Run
./aitrader
```

### One-Line Install
```bash
go install github.com/yourusername/aitrader-tui/cmd/aitrader@latest
```

## ⌨️ Keyboard Shortcuts

### Navigation
| Key | Action |
|-----|--------|
| `1-6` | Switch to panel (Market, Traders, Signals, Positions, AI, Logs) |
| `Tab` | Next panel |
| `Shift+Tab` | Previous panel |
| `↑/↓` | Navigate within tables |
| `Enter` | Select/Action on item |

### Actions
| Key | Action |
|-----|--------|
| `r` | Refresh data |
| `c` | Create new trader |
| `e` | Execute trade |
| `v` | View detailed chart |

### General
| Key | Action |
|-----|--------|
| `?` | Toggle help |
| `q` or `Ctrl+C` | Quit |

## 🏗️ Project Structure

```
terminal/
├── cmd/
│   └── aitrader/
│       └── main.go              # Entry point
├── internal/
│   └── tui/
│       ├── model.go             # Core state model
│       ├── update.go            # Event handlers
│       ├── view.go              # Rendering logic
│       ├── tables.go            # Table components
│       └── styles/
│           └── theme.go         # Color theme & styles
├── go.mod
└── README.md
```

## 🎨 Customization

### Color Theme
Edit `internal/tui/styles/theme.go` to customize colors:

```go
var (
    Background = lipgloss.Color("#1a1b26")  // Dark background
    Foreground = lipgloss.Color("#c0caf5")  // Light text
    Profit     = lipgloss.Color("#9ece6a")  // Green
    Loss       = lipgloss.Color("#f7768e")  // Red
    // ... more colors
)
```

### Refresh Rate
Modify `refreshRate` in `model.go`:

```go
m := Model{
    refreshRate: 100 * time.Millisecond, // Adjust as needed
}
```

## 🔌 Integration with Backend

The TUI can connect to:

1. **Fly Machine Backend** - Full trading functionality
2. **Local Development** - Mock data for testing
3. **WebSocket Feeds** - Real-time market data

### Environment Variables
```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
export USER_ID="your-user-id"
export PAPER_TRADING_ONLY="true"
```

## 🚧 Roadmap

### Phase 1 (Current)
- [x] Basic TUI structure
- [x] Market overview panel
- [x] Traders panel
- [x] Signals panel
- [x] Positions panel
- [x] AI analysis panel
- [x] Log viewer
- [x] Keyboard navigation

### Phase 2 (Next)
- [ ] WebSocket integration for live data
- [ ] Create/edit trader dialogs
- [ ] Trade execution confirmations
- [ ] ASCII candlestick charts
- [ ] Configuration file support

### Phase 3 (Future)
- [ ] Multiple color themes
- [ ] Session persistence
- [ ] Command palette (Ctrl+P)
- [ ] Export functionality
- [ ] Notification system

## 🔧 Development

### Run in Development Mode
```bash
go run cmd/aitrader/main.go
```

### Build for Production
```bash
# Build optimized binary
go build -ldflags="-s -w" -o aitrader ./cmd/aitrader

# Build for multiple platforms
GOOS=linux GOARCH=amd64 go build -o aitrader-linux ./cmd/aitrader
GOOS=darwin GOARCH=arm64 go build -o aitrader-macos ./cmd/aitrader
GOOS=windows GOARCH=amd64 go build -o aitrader.exe ./cmd/aitrader
```

### Hot Reload Development
```bash
# Install air for hot reloading
go install github.com/cosmtrek/air@latest

# Run with hot reload
air
```

## 📊 Performance

| Metric | Value |
|--------|-------|
| Binary Size | ~15MB |
| Memory Usage | ~30-50MB |
| Startup Time | <500ms |
| CPU (idle) | <1% |
| Refresh Rate | 100ms |

## 🐛 Troubleshooting

### Unicode characters not displaying
Ensure your terminal supports Unicode:
```bash
echo $LANG  # Should show UTF-8
```

### Colors not showing
Enable 256-color support:
```bash
export TERM=xterm-256color
```

### Layout issues
Resize terminal to at least 80x40 for optimal experience.

## 📝 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- [Bubbletea](https://github.com/charmbracelet/bubbletea) - The Elm Architecture for Go
- [Lipgloss](https://github.com/charmbracelet/lipgloss) - Style definitions
- [Bubbles](https://github.com/charmbracelet/bubbles) - TUI components
- [ASCII Graph](https://github.com/guptarohit/asciigraph) - Terminal charts

## 🚀 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

Made with ❤️ using [Bubbletea](https://github.com/charmbracelet/bubbletea)
