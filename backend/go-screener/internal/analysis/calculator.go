package analysis

import (
	"fmt"
	"log"

	"github.com/vyx/go-screener/pkg/indicators"
	"github.com/vyx/go-screener/pkg/types"
)

// Calculator calculates technical indicators from market data
type Calculator struct {
	defaultLimit int // Default number of klines to use for calculation
}

// NewCalculator creates a new indicator calculator
func NewCalculator(defaultLimit int) *Calculator {
	return &Calculator{
		defaultLimit: defaultLimit,
	}
}

// CalculateIndicators computes all indicators specified in trader config
func (c *Calculator) CalculateIndicators(req *AnalysisRequest) (map[string]interface{}, error) {
	if req.Trader == nil {
		return nil, fmt.Errorf("trader config is nil")
	}

	if len(req.Trader.Filter.Indicators) == 0 {
		// No indicators configured - this is OK, just return empty
		log.Printf("[Calculator] Warning: Trader %s has no indicators configured", req.TraderID)
		return make(map[string]interface{}), nil
	}

	// Get klines for the primary interval
	klines, ok := req.MarketData.Klines[req.Interval]
	if !ok || len(klines) == 0 {
		return nil, fmt.Errorf("no klines available for interval %s", req.Interval)
	}

	// Limit klines to default limit (for AI analysis)
	limit := c.defaultLimit
	if len(klines) > limit {
		klines = klines[len(klines)-limit:]
	}

	result := make(map[string]interface{})

	// Calculate each indicator
	for _, indConfig := range req.Trader.Filter.Indicators {
		value, err := c.calculateIndicator(indConfig, klines, req.MarketData)
		if err != nil {
			log.Printf("[Calculator] Failed to calculate %s: %v", indConfig.Name, err)
			continue // Skip this indicator but continue with others
		}

		result[indConfig.Name] = value
	}

	return result, nil
}

// calculateIndicator calculates a single indicator based on its config
func (c *Calculator) calculateIndicator(config types.IndicatorConfig, klines []types.Kline, marketData *types.MarketData) (interface{}, error) {
	switch config.Name {
	case "MA", "SMA":
		return c.calculateMA(config, klines)
	case "EMA":
		return c.calculateEMA(config, klines)
	case "RSI":
		return c.calculateRSI(config, klines)
	case "MACD":
		return c.calculateMACD(config, klines)
	case "BollingerBands", "BB":
		return c.calculateBollingerBands(config, klines)
	case "VWAP":
		return c.calculateVWAP(klines)
	case "Stochastic":
		return c.calculateStochastic(config, klines)
	default:
		return nil, fmt.Errorf("unsupported indicator: %s", config.Name)
	}
}

// calculateMA calculates Simple Moving Average
func (c *Calculator) calculateMA(config types.IndicatorConfig, klines []types.Kline) (interface{}, error) {
	period, err := getIntParam(config.Params, "period", 20)
	if err != nil {
		return nil, err
	}

	series := indicators.CalculateMASeries(klines, period)
	if len(series) == 0 {
		return nil, fmt.Errorf("insufficient data for MA(%d)", period)
	}

	return map[string]interface{}{
		"value":   series[len(series)-1],
		"series":  series,
		"period":  period,
	}, nil
}

// calculateEMA calculates Exponential Moving Average
func (c *Calculator) calculateEMA(config types.IndicatorConfig, klines []types.Kline) (interface{}, error) {
	period, err := getIntParam(config.Params, "period", 20)
	if err != nil {
		return nil, err
	}

	series := indicators.CalculateEMASeries(klines, period)
	if len(series) == 0 {
		return nil, fmt.Errorf("insufficient data for EMA(%d)", period)
	}

	return map[string]interface{}{
		"value":   series[len(series)-1],
		"series":  series,
		"period":  period,
	}, nil
}

// calculateRSI calculates Relative Strength Index
func (c *Calculator) calculateRSI(config types.IndicatorConfig, klines []types.Kline) (interface{}, error) {
	period, err := getIntParam(config.Params, "period", 14)
	if err != nil {
		return nil, err
	}

	result := indicators.CalculateRSI(klines, period)
	if result == nil || len(result.Values) == 0 {
		return nil, fmt.Errorf("insufficient data for RSI(%d)", period)
	}

	return map[string]interface{}{
		"value":  result.Values[len(result.Values)-1],
		"series": result.Values,
		"period": period,
	}, nil
}

// calculateMACD calculates MACD indicator
func (c *Calculator) calculateMACD(config types.IndicatorConfig, klines []types.Kline) (interface{}, error) {
	shortPeriod, err := getIntParam(config.Params, "shortPeriod", 12)
	if err != nil {
		return nil, err
	}
	longPeriod, err := getIntParam(config.Params, "longPeriod", 26)
	if err != nil {
		return nil, err
	}
	signalPeriod, err := getIntParam(config.Params, "signalPeriod", 9)
	if err != nil {
		return nil, err
	}

	result := indicators.CalculateMACD(klines, shortPeriod, longPeriod, signalPeriod)
	if result == nil || len(result.MACD) == 0 {
		return nil, fmt.Errorf("insufficient data for MACD(%d,%d,%d)", shortPeriod, longPeriod, signalPeriod)
	}

	lastIdx := len(result.MACD) - 1
	return map[string]interface{}{
		"macd":      result.MACD[lastIdx],
		"signal":    result.Signal[lastIdx],
		"histogram": result.Histogram[lastIdx],
		"macdSeries": result.MACD,
		"signalSeries": result.Signal,
		"histogramSeries": result.Histogram,
	}, nil
}

// calculateBollingerBands calculates Bollinger Bands
func (c *Calculator) calculateBollingerBands(config types.IndicatorConfig, klines []types.Kline) (interface{}, error) {
	period, err := getIntParam(config.Params, "period", 20)
	if err != nil {
		return nil, err
	}
	stdDev := getFloatParam(config.Params, "stdDev", 2.0)

	result := indicators.CalculateBollingerBands(klines, period, stdDev)
	if result == nil || len(result.Upper) == 0 {
		return nil, fmt.Errorf("insufficient data for BB(%d,%.1f)", period, stdDev)
	}

	lastIdx := len(result.Upper) - 1
	return map[string]interface{}{
		"upper":       result.Upper[lastIdx],
		"middle":      result.Middle[lastIdx],
		"lower":       result.Lower[lastIdx],
		"upperSeries": result.Upper,
		"middleSeries": result.Middle,
		"lowerSeries": result.Lower,
		"period":      period,
		"stdDev":      stdDev,
	}, nil
}

// calculateVWAP calculates Volume Weighted Average Price
func (c *Calculator) calculateVWAP(klines []types.Kline) (interface{}, error) {
	vwap := indicators.CalculateVWAP(klines)
	if vwap == 0 {
		return nil, fmt.Errorf("failed to calculate VWAP")
	}

	return map[string]interface{}{
		"value": vwap,
	}, nil
}

// calculateStochastic calculates Stochastic Oscillator
func (c *Calculator) calculateStochastic(config types.IndicatorConfig, klines []types.Kline) (interface{}, error) {
	kPeriod, err := getIntParam(config.Params, "kPeriod", 14)
	if err != nil {
		return nil, err
	}
	dPeriod, err := getIntParam(config.Params, "dPeriod", 3)
	if err != nil {
		return nil, err
	}

	result := indicators.CalculateStochastic(klines, kPeriod, dPeriod)
	if result == nil {
		return nil, fmt.Errorf("insufficient data for Stochastic(%d,%d)", kPeriod, dPeriod)
	}

	return map[string]interface{}{
		"k":       result.K,
		"d":       result.D,
		"kPeriod": kPeriod,
		"dPeriod": dPeriod,
	}, nil
}

// Helper functions to extract parameters from config

func getIntParam(params map[string]interface{}, key string, defaultValue int) (int, error) {
	if params == nil {
		return defaultValue, nil
	}

	val, ok := params[key]
	if !ok {
		return defaultValue, nil
	}

	// Try different numeric types
	switch v := val.(type) {
	case int:
		return v, nil
	case int64:
		return int(v), nil
	case float64:
		return int(v), nil
	case string:
		var result int
		_, err := fmt.Sscanf(v, "%d", &result)
		if err != nil {
			return 0, fmt.Errorf("invalid integer parameter %s: %s", key, v)
		}
		return result, nil
	default:
		return 0, fmt.Errorf("unsupported type for parameter %s: %T", key, val)
	}
}

func getFloatParam(params map[string]interface{}, key string, defaultValue float64) float64 {
	if params == nil {
		return defaultValue
	}

	val, ok := params[key]
	if !ok {
		return defaultValue
	}

	switch v := val.(type) {
	case float64:
		return v
	case float32:
		return float64(v)
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case string:
		var result float64
		_, err := fmt.Sscanf(v, "%f", &result)
		if err != nil {
			return defaultValue
		}
		return result
	default:
		return defaultValue
	}
}
