package engine

import (
	"testing"

	"github.com/yourusername/aitrader-tui/internal/storage"
)

func TestDetectMode(t *testing.T) {
	tests := []struct {
		name    string
		daemon  bool
		deploy  bool
		monitor bool
		want    Mode
	}{
		{
			name:    "default local mode",
			daemon:  false,
			deploy:  false,
			monitor: false,
			want:    ModeLocal,
		},
		{
			name:    "daemon mode",
			daemon:  true,
			deploy:  false,
			monitor: false,
			want:    ModeDaemon,
		},
		{
			name:    "deploy mode",
			daemon:  false,
			deploy:  true,
			monitor: false,
			want:    ModeDeploy,
		},
		{
			name:    "monitor mode",
			daemon:  false,
			deploy:  false,
			monitor: true,
			want:    ModeMonitor,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := DetectMode(tt.daemon, tt.deploy, tt.monitor)
			if got != tt.want {
				t.Errorf("DetectMode() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestNewEngine(t *testing.T) {
	cfg := Config{
		UserID:           "test-user",
		PaperTradingOnly: true,
		Mode:             ModeLocal,
	}

	engine := New(cfg)

	if engine == nil {
		t.Fatal("Expected engine to be created")
	}

	if engine.config.UserID != "test-user" {
		t.Errorf("Expected UserID = 'test-user', got %s", engine.config.UserID)
	}

	if engine.mode != ModeLocal {
		t.Errorf("Expected mode = ModeLocal, got %s", engine.mode)
	}

	if engine.running {
		t.Error("Expected engine to not be running initially")
	}
}

func TestEngineGetStatusBeforeStart(t *testing.T) {
	cfg := Config{
		UserID:           "test-user",
		PaperTradingOnly: true,
		Mode:             ModeLocal,
	}

	engine := New(cfg)
	status := engine.GetStatus()

	if status["running"] != false {
		t.Error("Expected engine to not be running")
	}

	if status["user_id"] != "test-user" {
		t.Errorf("Expected user_id = 'test-user', got %v", status["user_id"])
	}

	if status["paper_trading"] != true {
		t.Error("Expected paper_trading = true")
	}
}

func TestCollectSymbols(t *testing.T) {
	// Test with empty traders - should return defaults
	symbols := collectSymbols([]storage.Trader{})

	if len(symbols) == 0 {
		t.Error("Expected default symbols, got empty slice")
	}

	// Check for some expected defaults
	hasDefault := false
	for _, sym := range symbols {
		if sym == "BTCUSDT" || sym == "ETHUSDT" {
			hasDefault = true
			break
		}
	}

	if !hasDefault {
		t.Error("Expected default symbols to include BTCUSDT or ETHUSDT")
	}
}

func TestCollectTimeframes(t *testing.T) {
	// Test with empty traders - should return defaults
	timeframes := collectTimeframes([]storage.Trader{})

	if len(timeframes) == 0 {
		t.Error("Expected default timeframes, got empty slice")
	}

	// Check for some expected defaults
	hasDefault := false
	for _, tf := range timeframes {
		if tf == "1h" || tf == "5m" {
			hasDefault = true
			break
		}
	}

	if !hasDefault {
		t.Error("Expected default timeframes to include 1h or 5m")
	}
}
