package executor

import (
	"fmt"
	"reflect"

	"github.com/rs/zerolog/log"
	"github.com/traefik/yaegi/interp"
	"github.com/traefik/yaegi/stdlib"
	"github.com/yourusername/trader-machine/internal/indicators"
)

// SignalExecutor executes user-generated signal code using Yaegi
type SignalExecutor struct {
	interpreter *interp.Interpreter
	traderID    string
	code        string
}

// NewSignalExecutor creates a new signal executor
func NewSignalExecutor(traderID, code string) (*SignalExecutor, error) {
	i := interp.New(interp.Options{})

	// Import standard library
	i.Use(stdlib.Symbols)

	// Import indicator helpers
	i.Use(interp.Exports{
		"github.com/yourusername/trader-machine/internal/indicators/indicators": map[string]reflect.Value{
			"GetCloses":                    reflect.ValueOf(indicators.GetCloses),
			"GetOpens":                     reflect.ValueOf(indicators.GetOpens),
			"GetHighs":                     reflect.ValueOf(indicators.GetHighs),
			"GetLows":                      reflect.ValueOf(indicators.GetLows),
			"GetVolumes":                   reflect.ValueOf(indicators.GetVolumes),
			"GetLatestSMA":                 reflect.ValueOf(indicators.GetLatestSMA),
			"GetLatestEMA":                 reflect.ValueOf(indicators.GetLatestEMA),
			"GetLatestWMA":                 reflect.ValueOf(indicators.GetLatestWMA),
			"GetLatestVWAP":                reflect.ValueOf(indicators.GetLatestVWAP),
			"GetLatestRSI":                 reflect.ValueOf(indicators.GetLatestRSI),
			"GetLatestMACD":                reflect.ValueOf(indicators.GetLatestMACD),
			"GetLatestStochastic":          reflect.ValueOf(indicators.GetLatestStochastic),
			"GetLatestCCI":                 reflect.ValueOf(indicators.GetLatestCCI),
			"GetLatestWilliamsR":           reflect.ValueOf(indicators.GetLatestWilliamsR),
			"GetLatestROC":                 reflect.ValueOf(indicators.GetLatestROC),
			"GetLatestBollingerBands":      reflect.ValueOf(indicators.GetLatestBollingerBands),
			"GetLatestATR":                 reflect.ValueOf(indicators.GetLatestATR),
			"GetLatestKeltnerChannels":     reflect.ValueOf(indicators.GetLatestKeltnerChannels),
			"GetLatestDonchianChannels":    reflect.ValueOf(indicators.GetLatestDonchianChannels),
			"GetLatestVolume":              reflect.ValueOf(indicators.GetLatestVolume),
			"GetLatestVolumeChange":        reflect.ValueOf(indicators.GetLatestVolumeChange),
			"GetLatestOBV":                 reflect.ValueOf(indicators.GetLatestOBV),
			"GetLatestVolumeMA":            reflect.ValueOf(indicators.GetLatestVolumeMA),
			"GetLatestADX":                 reflect.ValueOf(indicators.GetLatestADX),
			"GetLatestAroon":               reflect.ValueOf(indicators.GetLatestAroon),
			"GetPriceChange":               reflect.ValueOf(indicators.GetPriceChange),
			"GetPriceChangePercent":        reflect.ValueOf(indicators.GetPriceChangePercent),
			"GetHighestHigh":               reflect.ValueOf(indicators.GetHighestHigh),
			"GetLowestLow":                 reflect.ValueOf(indicators.GetLowestLow),
		},
	})

	// Compile user code (5-20ms)
	log.Debug().
		Str("trader_id", traderID).
		Msg("Compiling signal code")

	_, err := i.Eval(code)
	if err != nil {
		log.Error().
			Err(err).
			Str("trader_id", traderID).
			Msg("Failed to compile signal code")
		return nil, fmt.Errorf("yaegi compilation failed: %w", err)
	}

	log.Info().
		Str("trader_id", traderID).
		Msg("Signal code compiled successfully")

	return &SignalExecutor{
		interpreter: i,
		traderID:    traderID,
		code:        code,
	}, nil
}

// CheckSignal executes the user's checkSignal function
func (se *SignalExecutor) CheckSignal(symbol string, ticker map[string]interface{}, klines map[string][][]interface{}) (bool, error) {
	// Build function call
	callStr := fmt.Sprintf(`checkSignal("%s", ticker, klines)`, symbol)

	// Set variables in interpreter scope
	se.interpreter.Use(interp.Exports{
		"main/main": map[string]reflect.Value{
			"ticker": reflect.ValueOf(ticker),
			"klines": reflect.ValueOf(klines),
		},
	})

	// Execute
	v, err := se.interpreter.Eval(callStr)
	if err != nil {
		log.Error().
			Err(err).
			Str("trader_id", se.traderID).
			Str("symbol", symbol).
			Msg("Signal check execution failed")
		return false, fmt.Errorf("execution failed: %w", err)
	}

	// Extract boolean result
	result := v.Bool()

	log.Debug().
		Str("trader_id", se.traderID).
		Str("symbol", symbol).
		Bool("matches", result).
		Msg("Signal check completed")

	return result, nil
}

// GetTraderID returns the trader ID
func (se *SignalExecutor) GetTraderID() string {
	return se.traderID
}

// Reload recompiles the signal code
func (se *SignalExecutor) Reload(code string) error {
	newExecutor, err := NewSignalExecutor(se.traderID, code)
	if err != nil {
		return err
	}

	se.interpreter = newExecutor.interpreter
	se.code = code

	log.Info().
		Str("trader_id", se.traderID).
		Msg("Signal code reloaded")

	return nil
}
