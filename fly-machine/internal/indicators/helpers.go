package indicators

import (
	"fmt"
	"math"
)

// Helper functions to extract values from kline array format
// Kline format: [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBuyBase, takerBuyQuote]

func GetCloses(klines [][]interface{}) []float64 {
	closes := make([]float64, len(klines))
	for i, k := range klines {
		closes[i] = toFloat(k[4])
	}
	return closes
}

func GetOpens(klines [][]interface{}) []float64 {
	opens := make([]float64, len(klines))
	for i, k := range klines {
		opens[i] = toFloat(k[1])
	}
	return opens
}

func GetHighs(klines [][]interface{}) []float64 {
	highs := make([]float64, len(klines))
	for i, k := range klines {
		highs[i] = toFloat(k[2])
	}
	return highs
}

func GetLows(klines [][]interface{}) []float64 {
	lows := make([]float64, len(klines))
	for i, k := range klines {
		lows[i] = toFloat(k[3])
	}
	return lows
}

func GetVolumes(klines [][]interface{}) []float64 {
	volumes := make([]float64, len(klines))
	for i, k := range klines {
		volumes[i] = toFloat(k[5])
	}
	return volumes
}

// Trend Indicators

func GetLatestSMA(klines [][]interface{}, period int) float64 {
	if len(klines) < period {
		return 0
	}
	closes := GetCloses(klines)
	recent := closes[len(closes)-period:]
	sum := 0.0
	for _, c := range recent {
		sum += c
	}
	return sum / float64(period)
}

func GetLatestEMA(klines [][]interface{}, period int) float64 {
	if len(klines) < period {
		return 0
	}
	closes := GetCloses(klines)
	multiplier := 2.0 / float64(period+1)

	// Start with SMA
	ema := 0.0
	for i := 0; i < period; i++ {
		ema += closes[i]
	}
	ema /= float64(period)

	// Calculate EMA
	for i := period; i < len(closes); i++ {
		ema = (closes[i]-ema)*multiplier + ema
	}

	return ema
}

func GetLatestWMA(klines [][]interface{}, period int) float64 {
	if len(klines) < period {
		return 0
	}
	closes := GetCloses(klines)
	recent := closes[len(closes)-period:]

	weightedSum := 0.0
	weightTotal := 0.0
	for i, c := range recent {
		weight := float64(i + 1)
		weightedSum += c * weight
		weightTotal += weight
	}

	return weightedSum / weightTotal
}

func GetLatestVWAP(klines [][]interface{}) float64 {
	if len(klines) == 0 {
		return 0
	}

	totalPV := 0.0
	totalVolume := 0.0

	for _, k := range klines {
		high := toFloat(k[2])
		low := toFloat(k[3])
		close := toFloat(k[4])
		volume := toFloat(k[5])

		typicalPrice := (high + low + close) / 3
		totalPV += typicalPrice * volume
		totalVolume += volume
	}

	if totalVolume == 0 {
		return 0
	}

	return totalPV / totalVolume
}

// Momentum Indicators

func GetLatestRSI(klines [][]interface{}, period int) float64 {
	if len(klines) < period+1 {
		return 50
	}

	closes := GetCloses(klines)
	gains := 0.0
	losses := 0.0

	// Calculate initial average gain/loss
	for i := len(closes) - period; i < len(closes); i++ {
		change := closes[i] - closes[i-1]
		if change > 0 {
			gains += change
		} else {
			losses += -change
		}
	}

	avgGain := gains / float64(period)
	avgLoss := losses / float64(period)

	if avgLoss == 0 {
		return 100
	}

	rs := avgGain / avgLoss
	rsi := 100 - (100 / (1 + rs))

	return rsi
}

func GetLatestMACD(klines [][]interface{}) (macd, signal, histogram float64) {
	if len(klines) < 26 {
		return 0, 0, 0
	}

	// Calculate EMA12 and EMA26
	ema12 := calculateEMA(GetCloses(klines), 12)
	ema26 := calculateEMA(GetCloses(klines), 26)

	macd = ema12 - ema26

	// Calculate signal line (9-period EMA of MACD)
	// For simplicity, using SMA here
	signal = macd * 0.9 // Approximation

	histogram = macd - signal

	return macd, signal, histogram
}

func GetLatestStochastic(klines [][]interface{}, kPeriod, dPeriod int) (k, d float64) {
	if len(klines) < kPeriod {
		return 50, 50
	}

	closes := GetCloses(klines)
	highs := GetHighs(klines)
	lows := GetLows(klines)

	recent := kPeriod
	highestHigh := highs[len(highs)-recent]
	lowestLow := lows[len(lows)-recent]

	for i := len(highs) - recent; i < len(highs); i++ {
		if highs[i] > highestHigh {
			highestHigh = highs[i]
		}
		if lows[i] < lowestLow {
			lowestLow = lows[i]
		}
	}

	currentClose := closes[len(closes)-1]

	if highestHigh == lowestLow {
		k = 50
	} else {
		k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100
	}

	// D is SMA of K
	d = k // Simplified

	return k, d
}

func GetLatestCCI(klines [][]interface{}, period int) float64 {
	if len(klines) < period {
		return 0
	}

	typicalPrices := make([]float64, len(klines))
	for i, k := range klines {
		high := toFloat(k[2])
		low := toFloat(k[3])
		close := toFloat(k[4])
		typicalPrices[i] = (high + low + close) / 3
	}

	recent := typicalPrices[len(typicalPrices)-period:]
	sma := 0.0
	for _, tp := range recent {
		sma += tp
	}
	sma /= float64(period)

	meanDeviation := 0.0
	for _, tp := range recent {
		meanDeviation += math.Abs(tp - sma)
	}
	meanDeviation /= float64(period)

	if meanDeviation == 0 {
		return 0
	}

	cci := (typicalPrices[len(typicalPrices)-1] - sma) / (0.015 * meanDeviation)

	return cci
}

func GetLatestWilliamsR(klines [][]interface{}, period int) float64 {
	if len(klines) < period {
		return -50
	}

	closes := GetCloses(klines)
	highs := GetHighs(klines)
	lows := GetLows(klines)

	highestHigh := highs[len(highs)-period]
	lowestLow := lows[len(lows)-period]

	for i := len(highs) - period; i < len(highs); i++ {
		if highs[i] > highestHigh {
			highestHigh = highs[i]
		}
		if lows[i] < lowestLow {
			lowestLow = lows[i]
		}
	}

	currentClose := closes[len(closes)-1]

	if highestHigh == lowestLow {
		return -50
	}

	williamsR := ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100

	return williamsR
}

func GetLatestROC(klines [][]interface{}, period int) float64 {
	if len(klines) < period+1 {
		return 0
	}

	closes := GetCloses(klines)
	currentClose := closes[len(closes)-1]
	pastClose := closes[len(closes)-1-period]

	if pastClose == 0 {
		return 0
	}

	roc := ((currentClose - pastClose) / pastClose) * 100

	return roc
}

// Volatility Indicators

func GetLatestBollingerBands(klines [][]interface{}, period int, stdDev float64) (upper, middle, lower float64) {
	if len(klines) < period {
		return 0, 0, 0
	}

	closes := GetCloses(klines)
	recent := closes[len(closes)-period:]

	// Calculate SMA (middle band)
	sum := 0.0
	for _, c := range recent {
		sum += c
	}
	middle = sum / float64(period)

	// Calculate standard deviation
	variance := 0.0
	for _, c := range recent {
		variance += math.Pow(c-middle, 2)
	}
	variance /= float64(period)
	std := math.Sqrt(variance)

	upper = middle + (std * stdDev)
	lower = middle - (std * stdDev)

	return upper, middle, lower
}

func GetLatestATR(klines [][]interface{}, period int) float64 {
	if len(klines) < period+1 {
		return 0
	}

	trueRanges := make([]float64, 0, len(klines)-1)

	for i := 1; i < len(klines); i++ {
		high := toFloat(klines[i][2])
		low := toFloat(klines[i][3])
		prevClose := toFloat(klines[i-1][4])

		tr := math.Max(high-low, math.Max(math.Abs(high-prevClose), math.Abs(low-prevClose)))
		trueRanges = append(trueRanges, tr)
	}

	recent := trueRanges[len(trueRanges)-period:]
	sum := 0.0
	for _, tr := range recent {
		sum += tr
	}

	return sum / float64(period)
}

func GetLatestKeltnerChannels(klines [][]interface{}, period, atrPeriod int, multiplier float64) (upper, middle, lower float64) {
	if len(klines) < period {
		return 0, 0, 0
	}

	middle = GetLatestEMA(klines, period)
	atr := GetLatestATR(klines, atrPeriod)

	upper = middle + (atr * multiplier)
	lower = middle - (atr * multiplier)

	return upper, middle, lower
}

func GetLatestDonchianChannels(klines [][]interface{}, period int) (upper, middle, lower float64) {
	if len(klines) < period {
		return 0, 0, 0
	}

	highs := GetHighs(klines)
	lows := GetLows(klines)

	recentHighs := highs[len(highs)-period:]
	recentLows := lows[len(lows)-period:]

	upper = recentHighs[0]
	lower = recentLows[0]

	for _, h := range recentHighs {
		if h > upper {
			upper = h
		}
	}

	for _, l := range recentLows {
		if l < lower {
			lower = l
		}
	}

	middle = (upper + lower) / 2

	return upper, middle, lower
}

// Volume Indicators

func GetLatestVolume(klines [][]interface{}, period int) float64 {
	if len(klines) < period {
		return 0
	}

	volumes := GetVolumes(klines)
	recent := volumes[len(volumes)-period:]

	sum := 0.0
	for _, v := range recent {
		sum += v
	}

	return sum / float64(period)
}

func GetLatestVolumeChange(klines [][]interface{}, period int) float64 {
	if len(klines) < period+1 {
		return 0
	}

	currentVolume := GetLatestVolume(klines, 1)
	pastVolume := GetLatestVolume(klines[len(klines)-period:], period)

	if pastVolume == 0 {
		return 0
	}

	return ((currentVolume - pastVolume) / pastVolume) * 100
}

func GetLatestOBV(klines [][]interface{}) float64 {
	if len(klines) < 2 {
		return 0
	}

	obv := 0.0
	closes := GetCloses(klines)
	volumes := GetVolumes(klines)

	for i := 1; i < len(klines); i++ {
		if closes[i] > closes[i-1] {
			obv += volumes[i]
		} else if closes[i] < closes[i-1] {
			obv -= volumes[i]
		}
	}

	return obv
}

func GetLatestVolumeMA(klines [][]interface{}, period int) float64 {
	return GetLatestVolume(klines, period)
}

// Trend Strength Indicators

func GetLatestADX(klines [][]interface{}, period int) float64 {
	if len(klines) < period+1 {
		return 0
	}

	// Simplified ADX calculation
	plusDM := 0.0
	minusDM := 0.0
	tr := 0.0

	for i := 1; i < len(klines); i++ {
		high := toFloat(klines[i][2])
		low := toFloat(klines[i][3])
		prevHigh := toFloat(klines[i-1][2])
		prevLow := toFloat(klines[i-1][3])
		prevClose := toFloat(klines[i-1][4])

		upMove := high - prevHigh
		downMove := prevLow - low

		if upMove > downMove && upMove > 0 {
			plusDM += upMove
		}
		if downMove > upMove && downMove > 0 {
			minusDM += downMove
		}

		trueRange := math.Max(high-low, math.Max(math.Abs(high-prevClose), math.Abs(low-prevClose)))
		tr += trueRange
	}

	if tr == 0 {
		return 0
	}

	plusDI := (plusDM / tr) * 100
	minusDI := (minusDM / tr) * 100

	dx := math.Abs(plusDI-minusDI) / (plusDI + minusDI) * 100

	return dx // Simplified ADX
}

func GetLatestAroon(klines [][]interface{}, period int) (aroonUp, aroonDown float64) {
	if len(klines) < period {
		return 50, 50
	}

	highs := GetHighs(klines)
	lows := GetLows(klines)

	recent := period

	// Find periods since highest high and lowest low
	periodsSinceHigh := 0
	periodsSinceLow := 0

	highestHigh := highs[len(highs)-1]
	lowestLow := lows[len(lows)-1]

	for i := len(highs) - 1; i >= len(highs)-recent; i-- {
		if highs[i] >= highestHigh {
			highestHigh = highs[i]
			periodsSinceHigh = len(highs) - 1 - i
		}
		if lows[i] <= lowestLow {
			lowestLow = lows[i]
			periodsSinceLow = len(lows) - 1 - i
		}
	}

	aroonUp = ((float64(period) - float64(periodsSinceHigh)) / float64(period)) * 100
	aroonDown = ((float64(period) - float64(periodsSinceLow)) / float64(period)) * 100

	return aroonUp, aroonDown
}

// Price Action

func GetPriceChange(klines [][]interface{}, periods int) float64 {
	if len(klines) < periods+1 {
		return 0
	}

	closes := GetCloses(klines)
	currentPrice := closes[len(closes)-1]
	pastPrice := closes[len(closes)-1-periods]

	return currentPrice - pastPrice
}

func GetPriceChangePercent(klines [][]interface{}, periods int) float64 {
	if len(klines) < periods+1 {
		return 0
	}

	closes := GetCloses(klines)
	currentPrice := closes[len(closes)-1]
	pastPrice := closes[len(closes)-1-periods]

	if pastPrice == 0 {
		return 0
	}

	return ((currentPrice - pastPrice) / pastPrice) * 100
}

func GetHighestHigh(klines [][]interface{}, periods int) float64 {
	if len(klines) < periods {
		return 0
	}

	highs := GetHighs(klines)
	recent := highs[len(highs)-periods:]

	highest := recent[0]
	for _, h := range recent {
		if h > highest {
			highest = h
		}
	}

	return highest
}

func GetLowestLow(klines [][]interface{}, periods int) float64 {
	if len(klines) < periods {
		return 0
	}

	lows := GetLows(klines)
	recent := lows[len(lows)-periods:]

	lowest := recent[0]
	for _, l := range recent {
		if l < lowest {
			lowest = l
		}
	}

	return lowest
}

// Helper functions

func toFloat(v interface{}) float64 {
	switch val := v.(type) {
	case float64:
		return val
	case string:
		// Parse string to float if needed
		var f float64
		_, _ = fmt.Sscanf(val, "%f", &f)
		return f
	case int:
		return float64(val)
	case int64:
		return float64(val)
	default:
		return 0
	}
}

func calculateEMA(data []float64, period int) float64 {
	if len(data) < period {
		return 0
	}

	multiplier := 2.0 / float64(period+1)

	// Start with SMA
	ema := 0.0
	for i := 0; i < period; i++ {
		ema += data[i]
	}
	ema /= float64(period)

	// Calculate EMA
	for i := period; i < len(data); i++ {
		ema = (data[i]-ema)*multiplier + ema
	}

	return ema
}
