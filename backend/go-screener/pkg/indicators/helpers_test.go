package indicators

import (
	"math"
	"testing"

	"github.com/vyx/go-screener/pkg/types"
)

// Test helpers
func createTestKlines(count int, startPrice float64) []types.Kline {
	klines := make([]types.Kline, count)
	for i := 0; i < count; i++ {
		price := startPrice + float64(i)*0.5
		klines[i] = types.Kline{
			OpenTime:  int64(i * 1000),
			Open:      price,
			High:      price + 1.0,
			Low:       price - 1.0,
			Close:     price + 0.5,
			Volume:    1000.0,
			CloseTime: int64((i + 1) * 1000),
		}
	}
	return klines
}

func TestCalculateMA(t *testing.T) {
	tests := []struct {
		name   string
		klines []types.Kline
		period int
		want   *float64
	}{
		{
			name:   "valid calculation",
			klines: createTestKlines(50, 100.0),
			period: 20,
			want:   func() *float64 { v := 120.25; return &v }(),
		},
		{
			name:   "insufficient data",
			klines: createTestKlines(10, 100.0),
			period: 20,
			want:   nil,
		},
		{
			name:   "invalid period",
			klines: createTestKlines(50, 100.0),
			period: 0,
			want:   nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CalculateMA(tt.klines, tt.period)
			if tt.want == nil && got != nil {
				t.Errorf("CalculateMA() = %v, want nil", *got)
			}
			if tt.want != nil && got == nil {
				t.Errorf("CalculateMA() = nil, want %v", *tt.want)
			}
			if tt.want != nil && got != nil && math.Abs(*got-*tt.want) > 0.01 {
				t.Errorf("CalculateMA() = %v, want %v", *got, *tt.want)
			}
		})
	}
}

func TestCalculateRSI(t *testing.T) {
	// Create klines with clear uptrend
	klines := make([]types.Kline, 50)
	for i := 0; i < 50; i++ {
		price := 100.0 + float64(i)*2.0 // Consistent uptrend
		klines[i] = types.Kline{
			Close: price,
		}
	}

	result := CalculateRSI(klines, 14)
	if result == nil {
		t.Fatal("CalculateRSI() returned nil")
	}

	// RSI should be high for consistent uptrend
	latestRSI := result.Values[len(result.Values)-1]
	if latestRSI < 70 {
		t.Errorf("RSI for uptrend = %v, want > 70", latestRSI)
	}

	// Test with insufficient data
	shortKlines := createTestKlines(10, 100.0)
	result = CalculateRSI(shortKlines, 14)
	if result != nil {
		t.Error("CalculateRSI() with insufficient data should return nil")
	}
}

func TestCalculateMACD(t *testing.T) {
	klines := createTestKlines(100, 100.0)

	result := CalculateMACD(klines, 12, 26, 9)
	if result == nil {
		t.Fatal("CalculateMACD() returned nil")
	}

	if len(result.MACD) != len(klines) {
		t.Errorf("MACD length = %d, want %d", len(result.MACD), len(klines))
	}

	if len(result.Signal) != len(klines) {
		t.Errorf("Signal length = %d, want %d", len(result.Signal), len(klines))
	}

	if len(result.Histogram) != len(klines) {
		t.Errorf("Histogram length = %d, want %d", len(result.Histogram), len(klines))
	}

	// Verify histogram = MACD - Signal
	idx := len(klines) - 1
	expectedHistogram := result.MACD[idx] - result.Signal[idx]
	if math.Abs(result.Histogram[idx]-expectedHistogram) > 0.001 {
		t.Errorf("Histogram[%d] = %v, expected %v", idx, result.Histogram[idx], expectedHistogram)
	}
}

func TestCalculateBollingerBands(t *testing.T) {
	klines := createTestKlines(50, 100.0)

	result := CalculateBollingerBands(klines, 20, 2.0)
	if result == nil {
		t.Fatal("CalculateBollingerBands() returned nil")
	}

	// Check that upper > middle > lower
	idx := len(klines) - 1
	if result.Upper[idx] <= result.Middle[idx] {
		t.Errorf("Upper band should be > middle band")
	}
	if result.Middle[idx] <= result.Lower[idx] {
		t.Errorf("Middle band should be > lower band")
	}

	// Middle band should equal MA
	ma := CalculateMA(klines, 20)
	if ma != nil && math.Abs(result.Middle[idx]-*ma) > 0.001 {
		t.Errorf("Middle band = %v, MA = %v, should be equal", result.Middle[idx], *ma)
	}
}

func TestCalculateAvgVolume(t *testing.T) {
	klines := createTestKlines(50, 100.0)

	result := CalculateAvgVolume(klines, 20)
	if result == nil {
		t.Fatal("CalculateAvgVolume() returned nil")
	}

	// All test klines have volume = 1000.0
	expected := 1000.0
	if math.Abs(*result-expected) > 0.001 {
		t.Errorf("CalculateAvgVolume() = %v, want %v", *result, expected)
	}
}

func TestGetHighestHigh(t *testing.T) {
	klines := createTestKlines(50, 100.0)

	result := GetHighestHigh(klines, 20)
	if result == nil {
		t.Fatal("GetHighestHigh() returned nil")
	}

	// Verify it found a reasonable high
	if *result < 100.0 {
		t.Errorf("GetHighestHigh() = %v, should be >= 100", *result)
	}
}

func TestGetLowestLow(t *testing.T) {
	klines := createTestKlines(50, 100.0)

	result := GetLowestLow(klines, 20)
	if result == nil {
		t.Fatal("GetLowestLow() returned nil")
	}

	// Verify it found a reasonable low
	if *result > 150.0 {
		t.Errorf("GetLowestLow() = %v, should be reasonable", *result)
	}
}

func TestCalculateVWAP(t *testing.T) {
	klines := createTestKlines(50, 100.0)

	result := CalculateVWAP(klines)

	// VWAP should be in reasonable range
	if result < 100.0 || result > 150.0 {
		t.Errorf("CalculateVWAP() = %v, expected in range [100, 150]", result)
	}

	// Test with empty klines
	emptyResult := CalculateVWAP([]types.Kline{})
	if emptyResult != 0 {
		t.Errorf("CalculateVWAP() with empty klines = %v, want 0", emptyResult)
	}
}

func TestDetectEngulfingPattern(t *testing.T) {
	tests := []struct {
		name   string
		klines []types.Kline
		want   string
	}{
		{
			name: "bullish engulfing",
			klines: []types.Kline{
				{Open: 100, Close: 98},  // Bearish candle
				{Open: 97, Close: 102},  // Bullish engulfing
				{Open: 102, Close: 103}, // Current candle
			},
			want: "bullish",
		},
		{
			name: "bearish engulfing",
			klines: []types.Kline{
				{Open: 100, Close: 102}, // Bullish candle
				{Open: 103, Close: 98},  // Bearish engulfing
				{Open: 98, Close: 97},   // Current candle
			},
			want: "bearish",
		},
		{
			name: "no pattern",
			klines: []types.Kline{
				{Open: 100, Close: 101},
				{Open: 101, Close: 102},
				{Open: 102, Close: 103},
			},
			want: "",
		},
		{
			name:   "insufficient data",
			klines: []types.Kline{{Open: 100, Close: 101}},
			want:   "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := DetectEngulfingPattern(tt.klines)
			if got != tt.want {
				t.Errorf("DetectEngulfingPattern() = %v, want %v", got, tt.want)
			}
		})
	}
}

func BenchmarkCalculateMA(b *testing.B) {
	klines := createTestKlines(250, 100.0)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		CalculateMA(klines, 20)
	}
}

func BenchmarkCalculateRSI(b *testing.B) {
	klines := createTestKlines(250, 100.0)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		CalculateRSI(klines, 14)
	}
}

func BenchmarkCalculateMACD(b *testing.B) {
	klines := createTestKlines(250, 100.0)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		CalculateMACD(klines, 12, 26, 9)
	}
}
