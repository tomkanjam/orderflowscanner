package cache

import (
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/vyx/go-screener/pkg/types"
)

// KlineCache provides thread-safe in-memory storage for kline data
type KlineCache struct {
	mu     sync.RWMutex
	data   map[string]map[string][]types.Kline // [symbol][interval][]Kline
	maxLen int                                  // max klines to keep per symbol/interval
	hits   int64                                // cache hit counter
	misses int64                                // cache miss counter
}

// NewKlineCache creates a new kline cache with specified max length per symbol/interval
func NewKlineCache(maxLen int) *KlineCache {
	return &KlineCache{
		data:   make(map[string]map[string][]types.Kline),
		maxLen: maxLen,
	}
}

// Set bulk sets klines for a symbol/interval pair (used for bootstrap)
func (c *KlineCache) Set(symbol, interval string, klines []types.Kline) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.data[symbol] == nil {
		c.data[symbol] = make(map[string][]types.Kline)
	}

	// Keep only the most recent maxLen klines
	if len(klines) > c.maxLen {
		klines = klines[len(klines)-c.maxLen:]
	}

	c.data[symbol][interval] = klines
	log.Printf("[KlineCache] Set %d klines for %s@%s", len(klines), symbol, interval)
}

// Get retrieves the latest N klines for a symbol/interval pair
// Returns empty slice if not found
func (c *KlineCache) Get(symbol, interval string, limit int) ([]types.Kline, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	symbolData, ok := c.data[symbol]
	if !ok {
		c.misses++
		return nil, fmt.Errorf("symbol %s not found in cache", symbol)
	}

	klines, ok := symbolData[interval]
	if !ok {
		c.misses++
		return nil, fmt.Errorf("interval %s not found for symbol %s", interval, symbol)
	}

	c.hits++

	// Return the latest N klines
	if len(klines) < limit {
		// Return all if we have fewer than requested
		result := make([]types.Kline, len(klines))
		copy(result, klines)
		return result, nil
	}

	// Return the last N klines
	result := make([]types.Kline, limit)
	copy(result, klines[len(klines)-limit:])
	return result, nil
}

// Update appends a new kline to the cache for a symbol/interval pair
// This is called when receiving WebSocket updates
func (c *KlineCache) Update(symbol, interval string, kline types.Kline) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.data[symbol] == nil {
		c.data[symbol] = make(map[string][]types.Kline)
	}

	klines := c.data[symbol][interval]

	// Check if this is an update to the last kline or a new kline
	if len(klines) > 0 && klines[len(klines)-1].OpenTime == kline.OpenTime {
		// Update existing kline (same open time = update to current candle)
		klines[len(klines)-1] = kline
		log.Printf("[KlineCache] Updated kline for %s@%s at %d", symbol, interval, kline.OpenTime)
	} else {
		// Append new kline
		klines = append(klines, kline)
		log.Printf("[KlineCache] Appended new kline for %s@%s at %d", symbol, interval, kline.OpenTime)

		// Trim if exceeds max length
		if len(klines) > c.maxLen {
			klines = klines[1:] // Remove oldest
		}
	}

	c.data[symbol][interval] = klines
}

// GetSymbols returns all symbols currently in the cache
func (c *KlineCache) GetSymbols() []string {
	c.mu.RLock()
	defer c.mu.RUnlock()

	symbols := make([]string, 0, len(c.data))
	for symbol := range c.data {
		symbols = append(symbols, symbol)
	}
	return symbols
}

// GetIntervals returns all intervals for a given symbol
func (c *KlineCache) GetIntervals(symbol string) []string {
	c.mu.RLock()
	defer c.mu.RUnlock()

	symbolData, ok := c.data[symbol]
	if !ok {
		return nil
	}

	intervals := make([]string, 0, len(symbolData))
	for interval := range symbolData {
		intervals = append(intervals, interval)
	}
	return intervals
}

// Has checks if the cache has data for a symbol/interval pair
func (c *KlineCache) Has(symbol, interval string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()

	symbolData, ok := c.data[symbol]
	if !ok {
		return false
	}

	_, ok = symbolData[interval]
	return ok
}

// Size returns the total number of klines in the cache
func (c *KlineCache) Size() int {
	c.mu.RLock()
	defer c.mu.RUnlock()

	count := 0
	for _, symbolData := range c.data {
		for _, klines := range symbolData {
			count += len(klines)
		}
	}
	return count
}

// Stats returns cache statistics
func (c *KlineCache) Stats() CacheStats {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return CacheStats{
		Symbols:   len(c.data),
		TotalKlines: c.Size(),
		Hits:      c.hits,
		Misses:    c.misses,
		HitRate:   c.calculateHitRate(),
	}
}

// CacheStats holds cache statistics
type CacheStats struct {
	Symbols     int
	TotalKlines int
	Hits        int64
	Misses      int64
	HitRate     float64
}

func (c *KlineCache) calculateHitRate() float64 {
	total := c.hits + c.misses
	if total == 0 {
		return 0
	}
	return float64(c.hits) / float64(total) * 100
}

// Clear removes all data from the cache
func (c *KlineCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.data = make(map[string]map[string][]types.Kline)
	c.hits = 0
	c.misses = 0
	log.Println("[KlineCache] Cleared all cache data")
}

// GetLatestKline returns the most recent kline for a symbol/interval
func (c *KlineCache) GetLatestKline(symbol, interval string) (*types.Kline, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	symbolData, ok := c.data[symbol]
	if !ok {
		return nil, fmt.Errorf("symbol %s not found in cache", symbol)
	}

	klines, ok := symbolData[interval]
	if !ok || len(klines) == 0 {
		return nil, fmt.Errorf("no klines found for %s@%s", symbol, interval)
	}

	return &klines[len(klines)-1], nil
}

// GetLastUpdateTime returns the close time of the latest kline for a symbol/interval
func (c *KlineCache) GetLastUpdateTime(symbol, interval string) (time.Time, error) {
	kline, err := c.GetLatestKline(symbol, interval)
	if err != nil {
		return time.Time{}, err
	}

	return time.Unix(kline.CloseTime/1000, 0), nil
}
