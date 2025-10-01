package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/yourusername/trader-machine/internal/binance"
	"github.com/yourusername/trader-machine/internal/config"
	"github.com/yourusername/trader-machine/internal/database"
	"github.com/yourusername/trader-machine/internal/events"
	"github.com/yourusername/trader-machine/internal/executor"
	"github.com/yourusername/trader-machine/internal/logger"
	"github.com/yourusername/trader-machine/internal/monitor"
	"github.com/yourusername/trader-machine/internal/reanalysis"
	"github.com/yourusername/trader-machine/internal/server"
	"github.com/yourusername/trader-machine/internal/storage"
	"github.com/yourusername/trader-machine/internal/timer"
	"github.com/yourusername/trader-machine/internal/types"
)

const version = "1.0.0"

func main() {
	// 1. Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to load configuration")
	}

	// 2. Setup logger with RFC3339 timestamps
	logger.Setup(cfg.LogLevel)

	log.Info().
		Str("version", version).
		Str("user_id", cfg.UserID).
		Bool("paper_trading", cfg.PaperTradingOnly).
		Msg("Starting trader machine")

	// 3. Connect to database
	db, err := database.New(cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to database")
	}
	defer db.Close()

	// 4. Initialize core components
	klineStore := storage.NewKlineStore()
	eventBus := events.New()

	// 5. Load active traders from database
	ctx := context.Background()
	traders, err := db.GetActiveTraders(ctx, cfg.UserID)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to load traders")
	}

	log.Info().Int("count", len(traders)).Msg("Loaded active traders")

	if len(traders) == 0 {
		log.Warn().Msg("No active traders found, waiting for traders to be created...")
	}

	// 6. Collect unique symbols and timeframes from all traders
	symbols := collectSymbols(traders)
	timeframes := collectTimeframes(traders)

	log.Info().
		Int("symbols", len(symbols)).
		Int("timeframes", len(timeframes)).
		Msg("Collected symbols and timeframes")

	// 7. Start Binance WebSocket for market data
	wsManager := binance.NewWSManager(klineStore, symbols, timeframes)
	if err := wsManager.Connect(); err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to Binance WebSocket")
	}
	go wsManager.StartReconnectLoop()

	// 8. Initialize trade executor
	var binanceClient *binance.Client
	if !cfg.PaperTradingOnly && cfg.BinanceAPIKey != "" && cfg.BinanceSecretKey != "" {
		binanceClient = binance.NewClient(cfg.BinanceAPIKey, cfg.BinanceSecretKey)
		log.Info().Msg("Binance REST client initialized for real trading")
	} else {
		log.Info().Msg("Paper trading mode enabled")
	}

	tradeExecutor := executor.NewTradeExecutor(binanceClient, db, cfg.PaperTradingOnly)

	// 9. Initialize position monitor
	positionMonitor := monitor.NewPositionMonitor(db, eventBus, tradeExecutor)

	// Load existing open positions
	positions, err := db.GetOpenPositions(ctx, cfg.UserID)
	if err != nil {
		log.Error().Err(err).Msg("Failed to load open positions")
	} else {
		for i := range positions {
			positionMonitor.AddPosition(&positions[i])
		}
		log.Info().Int("count", len(positions)).Msg("Loaded open positions")
	}

	// Start position monitoring
	go positionMonitor.Start()

	// 10. Initialize timer manager for signal checks
	timerManager := timer.NewManager(db, klineStore, wsManager, analyzeSignal)

	// Create signal executors and start timers for each trader
	for i := range traders {
		trader := &traders[i]

		signalExecutor, err := executor.NewSignalExecutor(trader.ID, trader.SignalCode)
		if err != nil {
			log.Error().
				Err(err).
				Str("trader_id", trader.ID).
				Msg("Failed to create signal executor")
			continue
		}

		if err := timerManager.AddTrader(trader, signalExecutor); err != nil {
			log.Error().
				Err(err).
				Str("trader_id", trader.ID).
				Msg("Failed to add trader to timer manager")
			continue
		}

		log.Info().
			Str("trader_id", trader.ID).
			Str("name", trader.Name).
			Str("check_interval", trader.CheckInterval).
			Msg("Trader timer started")
	}

	// 11. Initialize re-analysis manager
	edgeFunctionURL := cfg.SupabaseURL + "/functions/v1/analyze-signal"
	reanalysisManager := reanalysis.NewManager(db, klineStore, eventBus, tradeExecutor, edgeFunctionURL)

	for i := range traders {
		trader := &traders[i]
		if trader.ReanalysisInterval != "" {
			if err := reanalysisManager.AddTrader(trader); err != nil {
				log.Error().
					Err(err).
					Str("trader_id", trader.ID).
					Msg("Failed to add trader to re-analysis manager")
				continue
			}

			log.Info().
				Str("trader_id", trader.ID).
				Str("reanalysis_interval", trader.ReanalysisInterval).
				Msg("Trader re-analysis started")
		}
	}

	// 12. Subscribe to ticker updates for position monitoring and re-analysis
	go func() {
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()

		for range ticker.C {
			for _, symbol := range symbols {
				tickerData := wsManager.GetTicker(symbol)
				if tickerData != nil {
					if lastPrice, ok := tickerData["lastPrice"].(string); ok {
						var price float64
						if _, err := parseFloat(lastPrice, &price); err == nil {
							positionMonitor.UpdatePrice(symbol, price)
							reanalysisManager.UpdatePrice(symbol, price)
						}
					}
				}
			}
		}
	}()

	// 13. Start HTTP server for health checks and management
	httpServer := server.New(":8080", db, wsManager, timerManager, positionMonitor, version)
	go func() {
		if err := httpServer.Start(); err != nil {
			log.Error().Err(err).Msg("HTTP server error")
		}
	}()

	// 14. Start heartbeat to update machine status
	go startHeartbeat(db, cfg.MachineID)

	// 15. Setup graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	log.Info().Msg("Trader machine is running. Press Ctrl+C to stop.")

	// Wait for shutdown signal
	<-sigChan

	log.Info().Msg("Shutdown signal received, initiating graceful shutdown...")

	// 16. Graceful shutdown sequence
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Stop all components in reverse order
	log.Info().Msg("Stopping timer manager...")
	timerManager.StopAll()

	log.Info().Msg("Stopping re-analysis manager...")
	reanalysisManager.StopAll()

	log.Info().Msg("Stopping position monitor...")
	positionMonitor.Stop()

	log.Info().Msg("Stopping HTTP server...")
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("Error shutting down HTTP server")
	}

	log.Info().Msg("Closing WebSocket connection...")
	if err := wsManager.Close(); err != nil {
		log.Error().Err(err).Msg("Error closing WebSocket")
	}

	log.Info().Msg("Closing database connection...")
	db.Close()

	log.Info().Msg("Trader machine shutdown complete")
}

// collectSymbols collects unique symbols from all traders
func collectSymbols(traders []types.Trader) []string {
	symbolMap := make(map[string]bool)

	for _, trader := range traders {
		if len(trader.Symbols) > 0 {
			for _, symbol := range trader.Symbols {
				symbolMap[symbol] = true
			}
		}
	}

	// If no symbols specified, use default top pairs
	if len(symbolMap) == 0 {
		defaultSymbols := []string{
			"BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "ADAUSDT",
			"XRPUSDT", "DOTUSDT", "DOGEUSDT", "MATICUSDT", "AVAXUSDT",
		}
		for _, symbol := range defaultSymbols {
			symbolMap[symbol] = true
		}
	}

	symbols := make([]string, 0, len(symbolMap))
	for symbol := range symbolMap {
		symbols = append(symbols, symbol)
	}

	return symbols
}

// collectTimeframes collects unique timeframes from all traders
func collectTimeframes(traders []types.Trader) []string {
	timeframeMap := make(map[string]bool)

	for _, trader := range traders {
		for _, tf := range trader.Timeframes {
			timeframeMap[tf] = true
		}
	}

	// If no timeframes specified, use defaults
	if len(timeframeMap) == 0 {
		timeframeMap["1m"] = true
		timeframeMap["5m"] = true
		timeframeMap["15m"] = true
		timeframeMap["1h"] = true
	}

	timeframes := make([]string, 0, len(timeframeMap))
	for tf := range timeframeMap {
		timeframes = append(timeframes, tf)
	}

	return timeframes
}

// analyzeSignal is the callback function for AI analysis
// This calls the Supabase Edge Function to get Gemini's decision
func analyzeSignal(ctx context.Context, traderID, signalID string, marketData types.MarketData) (*types.Decision, error) {
	// This would be implemented to call the Supabase Edge Function
	// For now, return a default decision
	log.Debug().
		Str("trader_id", traderID).
		Str("signal_id", signalID).
		Msg("Analyzing signal (placeholder)")

	return &types.Decision{
		Decision:   "watch",
		Reasoning:  "Placeholder analysis - implement Edge Function call",
		Confidence: 50,
		Metadata:   make(map[string]interface{}),
	}, nil
}

// startHeartbeat sends periodic heartbeat updates to database
func startHeartbeat(db *database.Client, machineID string) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		if err := db.UpdateHeartbeat(ctx, machineID); err != nil {
			log.Error().Err(err).Msg("Failed to update heartbeat")
		}
		cancel()
	}
}

// parseFloat helper to parse float from string
func parseFloat(s string, f *float64) (int, error) {
	n, err := fmt.Sscanf(s, "%f", f)
	return n, err
}
