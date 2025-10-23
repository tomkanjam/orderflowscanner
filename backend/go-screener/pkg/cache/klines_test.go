package cache

import (
	"sync"
	"testing"
	"time"

	"github.com/vyx/go-screener/pkg/types"
)

func TestKlineCache_SetAndGet(t *testing.T) {
	cache := NewKlineCache(500)

	klines := []types.Kline{
		{OpenTime: 1000, Close: 100.0},
		{OpenTime: 2000, Close: 101.0},
		{OpenTime: 3000, Close: 102.0},
	}

	cache.Set("BTCUSDT", "5m", klines)

	retrieved, err := cache.Get("BTCUSDT", "5m", 3)
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}

	if len(retrieved) != 3 {
		t.Errorf("Expected 3 klines, got %d", len(retrieved))
	}

	if retrieved[0].Close != 100.0 {
		t.Errorf("Expected first kline close=100.0, got %f", retrieved[0].Close)
	}
}

func TestKlineCache_GetLimit(t *testing.T) {
	cache := NewKlineCache(500)

	klines := make([]types.Kline, 100)
	for i := 0; i < 100; i++ {
		klines[i] = types.Kline{
			OpenTime: int64(i * 1000),
			Close:    float64(i),
		}
	}

	cache.Set("ETHUSDT", "5m", klines)

	// Request last 10
	retrieved, err := cache.Get("ETHUSDT", "5m", 10)
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}

	if len(retrieved) != 10 {
		t.Errorf("Expected 10 klines, got %d", len(retrieved))
	}

	// Should get klines 90-99
	if retrieved[0].Close != 90.0 {
		t.Errorf("Expected first kline close=90.0, got %f", retrieved[0].Close)
	}

	if retrieved[9].Close != 99.0 {
		t.Errorf("Expected last kline close=99.0, got %f", retrieved[9].Close)
	}
}

func TestKlineCache_Update(t *testing.T) {
	cache := NewKlineCache(500)

	initial := []types.Kline{
		{OpenTime: 1000, Close: 100.0},
		{OpenTime: 2000, Close: 101.0},
	}

	cache.Set("BTCUSDT", "5m", initial)

	// Update existing kline (same OpenTime)
	cache.Update("BTCUSDT", "5m", types.Kline{
		OpenTime: 2000,
		Close:    105.0, // Updated price
	})

	retrieved, _ := cache.Get("BTCUSDT", "5m", 2)
	if retrieved[1].Close != 105.0 {
		t.Errorf("Expected updated close=105.0, got %f", retrieved[1].Close)
	}

	if len(retrieved) != 2 {
		t.Errorf("Expected 2 klines after update, got %d", len(retrieved))
	}
}

func TestKlineCache_AppendNew(t *testing.T) {
	cache := NewKlineCache(500)

	initial := []types.Kline{
		{OpenTime: 1000, Close: 100.0},
	}

	cache.Set("BTCUSDT", "5m", initial)

	// Append new kline (different OpenTime)
	cache.Update("BTCUSDT", "5m", types.Kline{
		OpenTime: 2000,
		Close:    101.0,
	})

	retrieved, _ := cache.Get("BTCUSDT", "5m", 10)
	if len(retrieved) != 2 {
		t.Errorf("Expected 2 klines after append, got %d", len(retrieved))
	}

	if retrieved[1].Close != 101.0 {
		t.Errorf("Expected new kline close=101.0, got %f", retrieved[1].Close)
	}
}

func TestKlineCache_MaxLength(t *testing.T) {
	cache := NewKlineCache(10) // Max 10 klines

	klines := make([]types.Kline, 20)
	for i := 0; i < 20; i++ {
		klines[i] = types.Kline{
			OpenTime: int64(i * 1000),
			Close:    float64(i),
		}
	}

	cache.Set("BTCUSDT", "5m", klines)

	retrieved, _ := cache.Get("BTCUSDT", "5m", 20)

	// Should only have last 10
	if len(retrieved) != 10 {
		t.Errorf("Expected 10 klines (max), got %d", len(retrieved))
	}

	// Should be klines 10-19
	if retrieved[0].Close != 10.0 {
		t.Errorf("Expected first kline close=10.0, got %f", retrieved[0].Close)
	}
}

func TestKlineCache_MaxLengthWithUpdates(t *testing.T) {
	cache := NewKlineCache(5) // Max 5 klines

	cache.Set("BTCUSDT", "5m", []types.Kline{
		{OpenTime: 1000, Close: 1.0},
		{OpenTime: 2000, Close: 2.0},
		{OpenTime: 3000, Close: 3.0},
	})

	// Add more klines
	cache.Update("BTCUSDT", "5m", types.Kline{OpenTime: 4000, Close: 4.0})
	cache.Update("BTCUSDT", "5m", types.Kline{OpenTime: 5000, Close: 5.0})
	cache.Update("BTCUSDT", "5m", types.Kline{OpenTime: 6000, Close: 6.0})

	retrieved, _ := cache.Get("BTCUSDT", "5m", 10)

	if len(retrieved) != 5 {
		t.Errorf("Expected 5 klines (max), got %d", len(retrieved))
	}

	// Oldest (1000) should be dropped, should have 2000-6000
	if retrieved[0].Close != 2.0 {
		t.Errorf("Expected first kline close=2.0, got %f", retrieved[0].Close)
	}

	if retrieved[4].Close != 6.0 {
		t.Errorf("Expected last kline close=6.0, got %f", retrieved[4].Close)
	}
}

func TestKlineCache_MultipleSymbols(t *testing.T) {
	cache := NewKlineCache(500)

	cache.Set("BTCUSDT", "5m", []types.Kline{{OpenTime: 1000, Close: 100.0}})
	cache.Set("ETHUSDT", "5m", []types.Kline{{OpenTime: 1000, Close: 50.0}})
	cache.Set("BNBUSDT", "1h", []types.Kline{{OpenTime: 1000, Close: 300.0}})

	symbols := cache.GetSymbols()
	if len(symbols) != 3 {
		t.Errorf("Expected 3 symbols, got %d", len(symbols))
	}

	btc, _ := cache.Get("BTCUSDT", "5m", 1)
	if btc[0].Close != 100.0 {
		t.Errorf("Expected BTC close=100.0, got %f", btc[0].Close)
	}

	eth, _ := cache.Get("ETHUSDT", "5m", 1)
	if eth[0].Close != 50.0 {
		t.Errorf("Expected ETH close=50.0, got %f", eth[0].Close)
	}

	bnb, _ := cache.Get("BNBUSDT", "1h", 1)
	if bnb[0].Close != 300.0 {
		t.Errorf("Expected BNB close=300.0, got %f", bnb[0].Close)
	}
}

func TestKlineCache_CacheMiss(t *testing.T) {
	cache := NewKlineCache(500)

	_, err := cache.Get("NONEXISTENT", "5m", 10)
	if err == nil {
		t.Error("Expected error for cache miss, got nil")
	}

	cache.Set("BTCUSDT", "5m", []types.Kline{{OpenTime: 1000}})

	_, err = cache.Get("BTCUSDT", "1h", 10) // Wrong interval
	if err == nil {
		t.Error("Expected error for wrong interval, got nil")
	}
}

func TestKlineCache_Stats(t *testing.T) {
	cache := NewKlineCache(500)

	cache.Set("BTCUSDT", "5m", []types.Kline{{OpenTime: 1000}})
	cache.Set("ETHUSDT", "5m", []types.Kline{{OpenTime: 1000}})

	// Trigger some hits
	cache.Get("BTCUSDT", "5m", 1)
	cache.Get("BTCUSDT", "5m", 1)

	// Trigger some misses
	cache.Get("NONEXISTENT", "5m", 1)

	stats := cache.Stats()

	if stats.Symbols != 2 {
		t.Errorf("Expected 2 symbols, got %d", stats.Symbols)
	}

	if stats.Hits != 2 {
		t.Errorf("Expected 2 hits, got %d", stats.Hits)
	}

	if stats.Misses != 1 {
		t.Errorf("Expected 1 miss, got %d", stats.Misses)
	}

	expectedHitRate := 66.66666666666666 // 2/3 * 100
	if stats.HitRate != expectedHitRate {
		t.Errorf("Expected hit rate %.2f%%, got %.2f%%", expectedHitRate, stats.HitRate)
	}
}

func TestKlineCache_ConcurrentAccess(t *testing.T) {
	cache := NewKlineCache(500)

	// Initialize with some data
	cache.Set("BTCUSDT", "5m", []types.Kline{
		{OpenTime: 1000, Close: 100.0},
	})

	var wg sync.WaitGroup
	numReaders := 50
	numWriters := 10

	// Concurrent readers
	for i := 0; i < numReaders; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				cache.Get("BTCUSDT", "5m", 10)
			}
		}()
	}

	// Concurrent writers
	for i := 0; i < numWriters; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				cache.Update("BTCUSDT", "5m", types.Kline{
					OpenTime: int64(2000 + j),
					Close:    float64(101 + j),
				})
			}
		}(i)
	}

	wg.Wait()

	// Verify data is still consistent
	retrieved, err := cache.Get("BTCUSDT", "5m", 10)
	if err != nil {
		t.Fatalf("Get after concurrent access failed: %v", err)
	}

	if len(retrieved) == 0 {
		t.Error("Expected klines after concurrent access, got empty")
	}
}

func TestKlineCache_Has(t *testing.T) {
	cache := NewKlineCache(500)

	if cache.Has("BTCUSDT", "5m") {
		t.Error("Expected false for empty cache")
	}

	cache.Set("BTCUSDT", "5m", []types.Kline{{OpenTime: 1000}})

	if !cache.Has("BTCUSDT", "5m") {
		t.Error("Expected true after Set")
	}

	if cache.Has("BTCUSDT", "1h") {
		t.Error("Expected false for different interval")
	}
}

func TestKlineCache_Clear(t *testing.T) {
	cache := NewKlineCache(500)

	cache.Set("BTCUSDT", "5m", []types.Kline{{OpenTime: 1000}})
	cache.Set("ETHUSDT", "5m", []types.Kline{{OpenTime: 1000}})

	cache.Clear()

	if cache.Size() != 0 {
		t.Errorf("Expected size 0 after Clear, got %d", cache.Size())
	}

	if len(cache.GetSymbols()) != 0 {
		t.Error("Expected no symbols after Clear")
	}

	stats := cache.Stats()
	if stats.Hits != 0 || stats.Misses != 0 {
		t.Error("Expected stats reset after Clear")
	}
}

func TestKlineCache_GetLatestKline(t *testing.T) {
	cache := NewKlineCache(500)

	klines := []types.Kline{
		{OpenTime: 1000, Close: 100.0},
		{OpenTime: 2000, Close: 101.0},
		{OpenTime: 3000, Close: 102.0},
	}

	cache.Set("BTCUSDT", "5m", klines)

	latest, err := cache.GetLatestKline("BTCUSDT", "5m")
	if err != nil {
		t.Fatalf("GetLatestKline failed: %v", err)
	}

	if latest.OpenTime != 3000 {
		t.Errorf("Expected latest OpenTime=3000, got %d", latest.OpenTime)
	}

	if latest.Close != 102.0 {
		t.Errorf("Expected latest Close=102.0, got %f", latest.Close)
	}
}

func TestKlineCache_GetLastUpdateTime(t *testing.T) {
	cache := NewKlineCache(500)

	closeTime := time.Now().Unix() * 1000 // milliseconds
	klines := []types.Kline{
		{OpenTime: 1000, CloseTime: closeTime, Close: 100.0},
	}

	cache.Set("BTCUSDT", "5m", klines)

	updateTime, err := cache.GetLastUpdateTime("BTCUSDT", "5m")
	if err != nil {
		t.Fatalf("GetLastUpdateTime failed: %v", err)
	}

	expected := time.Unix(closeTime/1000, 0)
	if updateTime.Unix() != expected.Unix() {
		t.Errorf("Expected update time %v, got %v", expected, updateTime)
	}
}

func TestKlineCache_GetIntervals(t *testing.T) {
	cache := NewKlineCache(500)

	cache.Set("BTCUSDT", "5m", []types.Kline{{OpenTime: 1000}})
	cache.Set("BTCUSDT", "1h", []types.Kline{{OpenTime: 1000}})
	cache.Set("BTCUSDT", "15m", []types.Kline{{OpenTime: 1000}})

	intervals := cache.GetIntervals("BTCUSDT")
	if len(intervals) != 3 {
		t.Errorf("Expected 3 intervals, got %d", len(intervals))
	}

	// Check that all intervals are present
	intervalMap := make(map[string]bool)
	for _, iv := range intervals {
		intervalMap[iv] = true
	}

	if !intervalMap["5m"] || !intervalMap["1h"] || !intervalMap["15m"] {
		t.Error("Missing expected intervals")
	}
}
