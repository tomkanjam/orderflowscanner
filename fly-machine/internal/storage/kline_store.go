package storage

import (
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

// KlineStore manages in-memory candlestick data
type KlineStore struct {
	data        map[string]map[string]*Klines // symbol -> timeframe -> klines
	mu          sync.RWMutex
	lastUpdate  time.Time
}

// Klines holds candlestick data for a symbol+timeframe
type Klines struct {
	Data      [][]interface{} // Array format matching Binance API
	MaxLength int             // Keep last N candles
}

// NewKlineStore creates a new kline storage instance
func NewKlineStore() *KlineStore {
	return &KlineStore{
		data:       make(map[string]map[string]*Klines),
		lastUpdate: time.Now(),
	}
}

// Update adds or updates a kline for a symbol+timeframe
func (ks *KlineStore) Update(symbol, timeframe string, kline []interface{}) {
	ks.mu.Lock()
	defer ks.mu.Unlock()

	if ks.data[symbol] == nil {
		ks.data[symbol] = make(map[string]*Klines)
	}

	if ks.data[symbol][timeframe] == nil {
		ks.data[symbol][timeframe] = &Klines{
			Data:      make([][]interface{}, 0, 1000),
			MaxLength: 1000, // Keep last 1000 candles
		}
	}

	klines := ks.data[symbol][timeframe]

	// Extract open time for comparison
	openTime := kline[0]

	// Check if update or new candle
	if len(klines.Data) > 0 {
		lastKline := klines.Data[len(klines.Data)-1]
		lastOpenTime := lastKline[0]

		if lastOpenTime == openTime {
			// Update existing candle
			klines.Data[len(klines.Data)-1] = kline
			ks.lastUpdate = time.Now()
			return
		}
	}

	// Append new candle
	klines.Data = append(klines.Data, kline)

	// Trim to max length
	if len(klines.Data) > klines.MaxLength {
		klines.Data = klines.Data[1:]
	}

	ks.lastUpdate = time.Now()

	log.Debug().
		Str("symbol", symbol).
		Str("timeframe", timeframe).
		Int("total_candles", len(klines.Data)).
		Msg("Kline updated")
}

// Get retrieves the last N klines for a symbol+timeframe
func (ks *KlineStore) Get(symbol, timeframe string, limit int) [][]interface{} {
	ks.mu.RLock()
	defer ks.mu.RUnlock()

	if ks.data[symbol] == nil || ks.data[symbol][timeframe] == nil {
		return nil
	}

	klines := ks.data[symbol][timeframe]

	if limit > len(klines.Data) || limit == 0 {
		limit = len(klines.Data)
	}

	// Return last N candles
	return klines.Data[len(klines.Data)-limit:]
}

// GetAll returns all klines for a symbol across all timeframes
func (ks *KlineStore) GetAll(symbol string) map[string][][]interface{} {
	ks.mu.RLock()
	defer ks.mu.RUnlock()

	if ks.data[symbol] == nil {
		return nil
	}

	result := make(map[string][][]interface{})
	for timeframe, klines := range ks.data[symbol] {
		result[timeframe] = klines.Data
	}

	return result
}

// GetSymbols returns all symbols currently stored
func (ks *KlineStore) GetSymbols() []string {
	ks.mu.RLock()
	defer ks.mu.RUnlock()

	symbols := make([]string, 0, len(ks.data))
	for symbol := range ks.data {
		symbols = append(symbols, symbol)
	}

	return symbols
}

// GetLastUpdate returns the timestamp of the last kline update
func (ks *KlineStore) GetLastUpdate() time.Time {
	ks.mu.RLock()
	defer ks.mu.RUnlock()
	return ks.lastUpdate
}

// Clear removes all stored klines
func (ks *KlineStore) Clear() {
	ks.mu.Lock()
	defer ks.mu.Unlock()

	ks.data = make(map[string]map[string]*Klines)
	log.Info().Msg("Kline store cleared")
}

// GetStats returns statistics about stored data
func (ks *KlineStore) GetStats() map[string]interface{} {
	ks.mu.RLock()
	defer ks.mu.RUnlock()

	totalSymbols := len(ks.data)
	totalCandles := 0

	for _, timeframes := range ks.data {
		for _, klines := range timeframes {
			totalCandles += len(klines.Data)
		}
	}

	return map[string]interface{}{
		"total_symbols":  totalSymbols,
		"total_candles":  totalCandles,
		"last_update":    ks.lastUpdate,
	}
}
