package indicators

import (
	"math"

	"github.com/vyx/go-screener/pkg/types"
)

// CalculateMA calculates the Simple Moving Average
func CalculateMA(klines []types.Kline, period int) *float64 {
	if len(klines) < period || period <= 0 {
		return nil
	}

	sum := 0.0
	for i := len(klines) - period; i < len(klines); i++ {
		sum += klines[i].Close
	}

	result := sum / float64(period)
	return &result
}

// CalculateMASeries calculates Simple Moving Average series
func CalculateMASeries(klines []types.Kline, period int) []float64 {
	if len(klines) < period || period <= 0 {
		return make([]float64, len(klines))
	}

	results := make([]float64, len(klines))
	for i := period - 1; i < len(klines); i++ {
		sum := 0.0
		for j := 0; j < period; j++ {
			sum += klines[i-j].Close
		}
		results[i] = sum / float64(period)
	}

	return results
}

// CalculateEMA calculates the Exponential Moving Average
func CalculateEMA(klines []types.Kline, period int) *float64 {
	if len(klines) < period || period <= 0 {
		return nil
	}

	k := 2.0 / float64(period+1)
	ema := klines[0].Close

	for i := 1; i < len(klines); i++ {
		ema = klines[i].Close*k + ema*(1-k)
	}

	return &ema
}

// CalculateEMASeries calculates Exponential Moving Average series
func CalculateEMASeries(klines []types.Kline, period int) []float64 {
	if len(klines) < period || period <= 0 {
		return make([]float64, len(klines))
	}

	results := make([]float64, len(klines))
	k := 2.0 / float64(period+1)

	// Initialize with first value
	results[0] = klines[0].Close

	// Calculate EMA for each point
	for i := 1; i < len(klines); i++ {
		results[i] = klines[i].Close*k + results[i-1]*(1-k)
	}

	return results
}

// RSIResult contains RSI calculation results
type RSIResult struct {
	Values []float64
}

// CalculateRSI calculates the Relative Strength Index
func CalculateRSI(klines []types.Kline, period int) *RSIResult {
	if len(klines) < period+1 || period <= 0 {
		return nil
	}

	gains := 0.0
	losses := 0.0

	// Calculate initial average gain and loss
	for i := 1; i <= period; i++ {
		change := klines[i].Close - klines[i-1].Close
		if change > 0 {
			gains += change
		} else {
			losses -= change
		}
	}

	avgGain := gains / float64(period)
	avgLoss := losses / float64(period)

	rsiValues := make([]float64, len(klines))

	// Calculate first RSI
	if avgLoss == 0 {
		if avgGain > 0 {
			rsiValues[period] = 100
		} else {
			rsiValues[period] = 50
		}
	} else {
		rs := avgGain / avgLoss
		rsiValues[period] = 100 - (100 / (1 + rs))
	}

	// Calculate subsequent RSI values
	for i := period + 1; i < len(klines); i++ {
		change := klines[i].Close - klines[i-1].Close

		currentGain := 0.0
		currentLoss := 0.0
		if change > 0 {
			currentGain = change
		} else {
			currentLoss = -change
		}

		avgGain = (avgGain*float64(period-1) + currentGain) / float64(period)
		avgLoss = (avgLoss*float64(period-1) + currentLoss) / float64(period)

		if avgLoss == 0 {
			if avgGain > 0 {
				rsiValues[i] = 100
			} else {
				rsiValues[i] = 50
			}
		} else {
			rs := avgGain / avgLoss
			rsiValues[i] = 100 - (100 / (1 + rs))
		}
	}

	return &RSIResult{Values: rsiValues}
}

// GetLatestRSI returns the most recent RSI value
func GetLatestRSI(klines []types.Kline, period int) *float64 {
	result := CalculateRSI(klines, period)
	if result == nil || len(result.Values) == 0 {
		return nil
	}

	// Find the last non-zero value
	for i := len(result.Values) - 1; i >= 0; i-- {
		if result.Values[i] != 0 {
			val := result.Values[i]
			return &val
		}
	}

	return nil
}

// MACDResult contains MACD calculation results
type MACDResult struct {
	MACD      []float64
	Signal    []float64
	Histogram []float64
}

// CalculateMACD calculates MACD, Signal, and Histogram
func CalculateMACD(klines []types.Kline, shortPeriod, longPeriod, signalPeriod int) *MACDResult {
	if len(klines) < longPeriod || shortPeriod <= 0 || longPeriod <= 0 || signalPeriod <= 0 {
		return nil
	}

	shortEMA := CalculateEMASeries(klines, shortPeriod)
	longEMA := CalculateEMASeries(klines, longPeriod)

	macdLine := make([]float64, len(klines))
	for i := 0; i < len(klines); i++ {
		macdLine[i] = shortEMA[i] - longEMA[i]
	}

	// Calculate signal line (EMA of MACD)
	signalLine := calculateEMAFromValues(macdLine, signalPeriod)

	// Calculate histogram
	histogram := make([]float64, len(klines))
	for i := 0; i < len(klines); i++ {
		histogram[i] = macdLine[i] - signalLine[i]
	}

	return &MACDResult{
		MACD:      macdLine,
		Signal:    signalLine,
		Histogram: histogram,
	}
}

// GetLatestMACD returns the most recent MACD values
func GetLatestMACD(klines []types.Kline, shortPeriod, longPeriod, signalPeriod int) *struct {
	MACD      float64
	Signal    float64
	Histogram float64
} {
	result := CalculateMACD(klines, shortPeriod, longPeriod, signalPeriod)
	if result == nil || len(result.MACD) == 0 {
		return nil
	}

	idx := len(result.MACD) - 1
	return &struct {
		MACD      float64
		Signal    float64
		Histogram float64
	}{
		MACD:      result.MACD[idx],
		Signal:    result.Signal[idx],
		Histogram: result.Histogram[idx],
	}
}

// BollingerBandsResult contains Bollinger Bands calculation results
type BollingerBandsResult struct {
	Upper  []float64
	Middle []float64
	Lower  []float64
}

// CalculateBollingerBands calculates Bollinger Bands
func CalculateBollingerBands(klines []types.Kline, period int, stdDev float64) *BollingerBandsResult {
	if len(klines) < period || period <= 0 {
		return nil
	}

	middle := CalculateMASeries(klines, period)
	upper := make([]float64, len(klines))
	lower := make([]float64, len(klines))

	for i := period - 1; i < len(klines); i++ {
		sum := 0.0
		for j := 0; j < period; j++ {
			diff := klines[i-j].Close - middle[i]
			sum += diff * diff
		}

		standardDeviation := math.Sqrt(sum / float64(period))
		upper[i] = middle[i] + (stdDev * standardDeviation)
		lower[i] = middle[i] - (stdDev * standardDeviation)
	}

	return &BollingerBandsResult{
		Upper:  upper,
		Middle: middle,
		Lower:  lower,
	}
}

// GetLatestBollingerBands returns the most recent Bollinger Bands values
func GetLatestBollingerBands(klines []types.Kline, period int, stdDev float64) *struct {
	Upper  float64
	Middle float64
	Lower  float64
} {
	result := CalculateBollingerBands(klines, period, stdDev)
	if result == nil || len(result.Middle) == 0 {
		return nil
	}

	idx := len(result.Middle) - 1
	return &struct {
		Upper  float64
		Middle float64
		Lower  float64
	}{
		Upper:  result.Upper[idx],
		Middle: result.Middle[idx],
		Lower:  result.Lower[idx],
	}
}

// CalculateAvgVolume calculates average volume over a period
func CalculateAvgVolume(klines []types.Kline, period int) *float64 {
	if len(klines) < period || period <= 0 {
		return nil
	}

	sum := 0.0
	for i := len(klines) - period; i < len(klines); i++ {
		sum += klines[i].Volume
	}

	result := sum / float64(period)
	return &result
}

// GetHighestHigh returns the highest high price over a period
func GetHighestHigh(klines []types.Kline, period int) *float64 {
	if len(klines) < period || period <= 0 {
		return nil
	}

	highestHigh := klines[len(klines)-period].High
	for i := len(klines) - period + 1; i < len(klines); i++ {
		if klines[i].High > highestHigh {
			highestHigh = klines[i].High
		}
	}

	return &highestHigh
}

// GetLowestLow returns the lowest low price over a period
func GetLowestLow(klines []types.Kline, period int) *float64 {
	if len(klines) < period || period <= 0 {
		return nil
	}

	lowestLow := klines[len(klines)-period].Low
	for i := len(klines) - period + 1; i < len(klines); i++ {
		if klines[i].Low < lowestLow {
			lowestLow = klines[i].Low
		}
	}

	return &lowestLow
}

// CalculateVWAP calculates Volume Weighted Average Price
func CalculateVWAP(klines []types.Kline) float64 {
	if len(klines) == 0 {
		return 0
	}

	cumulativeTPV := 0.0
	cumulativeVolume := 0.0

	for _, kline := range klines {
		typicalPrice := (kline.High + kline.Low + kline.Close) / 3
		cumulativeTPV += typicalPrice * kline.Volume
		cumulativeVolume += kline.Volume
	}

	if cumulativeVolume == 0 {
		return 0
	}

	return cumulativeTPV / cumulativeVolume
}

// StochasticResult contains Stochastic Oscillator results
type StochasticResult struct {
	K float64
	D float64
}

// CalculateStochastic calculates Stochastic Oscillator
func CalculateStochastic(klines []types.Kline, kPeriod, dPeriod int) *StochasticResult {
	if len(klines) < kPeriod || kPeriod <= 0 {
		return nil
	}

	highestHigh := klines[len(klines)-kPeriod].High
	lowestLow := klines[len(klines)-kPeriod].Low

	for i := len(klines) - kPeriod + 1; i < len(klines); i++ {
		if klines[i].High > highestHigh {
			highestHigh = klines[i].High
		}
		if klines[i].Low < lowestLow {
			lowestLow = klines[i].Low
		}
	}

	currentClose := klines[len(klines)-1].Close

	var kValue float64
	if highestHigh > lowestLow {
		kValue = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100
	} else {
		kValue = 50
	}

	// Simplified %D calculation
	dValue := kValue * 0.9

	return &StochasticResult{
		K: kValue,
		D: dValue,
	}
}

// Helper function to calculate EMA from a series of values
func calculateEMAFromValues(values []float64, period int) []float64 {
	if len(values) < period || period <= 0 {
		return make([]float64, len(values))
	}

	result := make([]float64, len(values))
	k := 2.0 / float64(period+1)

	// Calculate initial SMA
	sum := 0.0
	for i := 0; i < period; i++ {
		sum += values[i]
	}
	result[period-1] = sum / float64(period)

	// Calculate subsequent EMAs
	for i := period; i < len(values); i++ {
		result[i] = values[i]*k + result[i-1]*(1-k)
	}

	return result
}

// DetectEngulfingPattern detects bullish or bearish engulfing patterns
func DetectEngulfingPattern(klines []types.Kline) string {
	if len(klines) < 3 {
		return ""
	}

	currentIdx := len(klines) - 2
	prevIdx := len(klines) - 3

	curO := klines[currentIdx].Open
	curC := klines[currentIdx].Close
	prevO := klines[prevIdx].Open
	prevC := klines[prevIdx].Close

	currentIsBullish := curC > curO
	currentIsBearish := curC < curO
	prevIsBullish := prevC > prevO
	prevIsBearish := prevC < prevO

	// Bullish Engulfing
	if prevIsBearish && currentIsBullish {
		if curO < prevC && curC > prevO {
			return "bullish"
		}
	}

	// Bearish Engulfing
	if prevIsBullish && currentIsBearish {
		if curO > prevC && curC < prevO {
			return "bearish"
		}
	}

	return ""
}
