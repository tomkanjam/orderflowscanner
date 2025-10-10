package binance

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/vyx/go-screener/pkg/types"
)

// Client handles Binance API interactions
type Client struct {
	apiURL     string
	httpClient *http.Client
}

// NewClient creates a new Binance API client
func NewClient(apiURL string) *Client {
	return &Client{
		apiURL: apiURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// GetTopSymbols fetches the top N USDT pairs by volume
func (c *Client) GetTopSymbols(count int, minVolume float64) ([]string, error) {
	url := fmt.Sprintf("%s/api/v3/ticker/24hr", c.apiURL)

	resp, err := c.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch tickers: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("binance API error: %s - %s", resp.Status, string(body))
	}

	var tickers []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&tickers); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	// Filter and sort
	type SymbolVolume struct {
		Symbol string
		Volume float64
	}

	var filtered []SymbolVolume
	for _, ticker := range tickers {
		symbol, ok := ticker["symbol"].(string)
		if !ok {
			continue
		}

		// Filter USDT pairs
		if !strings.HasSuffix(symbol, "USDT") {
			continue
		}

		// Exclude futures/options
		if strings.Contains(symbol, "_") {
			continue
		}

		// Exclude leveraged tokens
		if strings.Contains(symbol, "UP") || strings.Contains(symbol, "DOWN") ||
			strings.Contains(symbol, "BEAR") || strings.Contains(symbol, "BULL") {
			continue
		}

		// Check volume
		quoteVolumeStr, ok := ticker["quoteVolume"].(string)
		if !ok {
			continue
		}

		quoteVolume, err := strconv.ParseFloat(quoteVolumeStr, 64)
		if err != nil || quoteVolume <= minVolume {
			continue
		}

		filtered = append(filtered, SymbolVolume{
			Symbol: symbol,
			Volume: quoteVolume,
		})
	}

	// Sort by volume descending
	sort.Slice(filtered, func(i, j int) bool {
		return filtered[i].Volume > filtered[j].Volume
	})

	// Take top N
	if len(filtered) > count {
		filtered = filtered[:count]
	}

	// Extract symbols
	symbols := make([]string, len(filtered))
	for i, sv := range filtered {
		symbols[i] = sv.Symbol
	}

	return symbols, nil
}

// GetKlines fetches historical kline/candlestick data
func (c *Client) GetKlines(symbol string, interval types.KlineInterval, limit int) ([]types.Kline, error) {
	url := fmt.Sprintf("%s/api/v3/klines?symbol=%s&interval=%s&limit=%d",
		c.apiURL, symbol, interval, limit)

	resp, err := c.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch klines: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("binance API error: %s - %s", resp.Status, string(body))
	}

	var rawKlines [][]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&rawKlines); err != nil {
		return nil, fmt.Errorf("failed to decode klines: %w", err)
	}

	// Convert to our Kline type
	klines := make([]types.Kline, len(rawKlines))
	for i, raw := range rawKlines {
		kline, err := parseKline(raw)
		if err != nil {
			return nil, fmt.Errorf("failed to parse kline at index %d: %w", i, err)
		}
		klines[i] = kline
	}

	return klines, nil
}

// GetTicker fetches current ticker data for a symbol
func (c *Client) GetTicker(symbol string) (*types.Ticker, error) {
	url := fmt.Sprintf("%s/api/v3/ticker/24hr?symbol=%s", c.apiURL, symbol)

	resp, err := c.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch ticker: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("binance API error: %s - %s", resp.Status, string(body))
	}

	var ticker types.Ticker
	if err := json.NewDecoder(resp.Body).Decode(&ticker); err != nil {
		return nil, fmt.Errorf("failed to decode ticker: %w", err)
	}

	return &ticker, nil
}

// GetMultipleKlines fetches klines for multiple symbols concurrently
func (c *Client) GetMultipleKlines(symbols []string, interval types.KlineInterval, limit int) (map[string][]types.Kline, error) {
	type result struct {
		symbol string
		klines []types.Kline
		err    error
	}

	resultChan := make(chan result, len(symbols))

	// Fetch concurrently with rate limiting
	semaphore := make(chan struct{}, 10) // Limit concurrent requests

	for _, symbol := range symbols {
		go func(sym string) {
			semaphore <- struct{}{} // Acquire
			defer func() { <-semaphore }() // Release

			klines, err := c.GetKlines(sym, interval, limit)
			resultChan <- result{symbol: sym, klines: klines, err: err}
		}(symbol)
	}

	// Collect results
	results := make(map[string][]types.Kline)
	var errors []string

	for i := 0; i < len(symbols); i++ {
		res := <-resultChan
		if res.err != nil {
			errors = append(errors, fmt.Sprintf("%s: %v", res.symbol, res.err))
		} else {
			results[res.symbol] = res.klines
		}
	}

	if len(errors) > 0 {
		return results, fmt.Errorf("errors fetching klines: %s", strings.Join(errors, "; "))
	}

	return results, nil
}

// parseKline converts a raw Binance kline to our Kline type
// Format: [openTime, open, high, low, close, volume, closeTime, quoteAssetVolume, numberOfTrades, takerBuyBaseAssetVolume, takerBuyQuoteAssetVolume, ignore]
func parseKline(raw []interface{}) (types.Kline, error) {
	if len(raw) < 12 {
		return types.Kline{}, fmt.Errorf("invalid kline data: expected 12 fields, got %d", len(raw))
	}

	parseFloat := func(v interface{}) (float64, error) {
		switch val := v.(type) {
		case float64:
			return val, nil
		case string:
			return strconv.ParseFloat(val, 64)
		default:
			return 0, fmt.Errorf("cannot parse float from %T", v)
		}
	}

	parseInt := func(v interface{}) (int64, error) {
		switch val := v.(type) {
		case float64:
			return int64(val), nil
		case int64:
			return val, nil
		case string:
			return strconv.ParseInt(val, 10, 64)
		default:
			return 0, fmt.Errorf("cannot parse int from %T", v)
		}
	}

	openTime, err := parseInt(raw[0])
	if err != nil {
		return types.Kline{}, fmt.Errorf("failed to parse openTime: %w", err)
	}

	open, err := parseFloat(raw[1])
	if err != nil {
		return types.Kline{}, fmt.Errorf("failed to parse open: %w", err)
	}

	high, err := parseFloat(raw[2])
	if err != nil {
		return types.Kline{}, fmt.Errorf("failed to parse high: %w", err)
	}

	low, err := parseFloat(raw[3])
	if err != nil {
		return types.Kline{}, fmt.Errorf("failed to parse low: %w", err)
	}

	close, err := parseFloat(raw[4])
	if err != nil {
		return types.Kline{}, fmt.Errorf("failed to parse close: %w", err)
	}

	volume, err := parseFloat(raw[5])
	if err != nil {
		return types.Kline{}, fmt.Errorf("failed to parse volume: %w", err)
	}

	closeTime, err := parseInt(raw[6])
	if err != nil {
		return types.Kline{}, fmt.Errorf("failed to parse closeTime: %w", err)
	}

	quoteAssetVolume, err := parseFloat(raw[7])
	if err != nil {
		return types.Kline{}, fmt.Errorf("failed to parse quoteAssetVolume: %w", err)
	}

	numberOfTrades, err := parseInt(raw[8])
	if err != nil {
		return types.Kline{}, fmt.Errorf("failed to parse numberOfTrades: %w", err)
	}

	takerBuyBaseAssetVolume, err := parseFloat(raw[9])
	if err != nil {
		return types.Kline{}, fmt.Errorf("failed to parse takerBuyBaseAssetVolume: %w", err)
	}

	takerBuyQuoteAssetVolume, err := parseFloat(raw[10])
	if err != nil {
		return types.Kline{}, fmt.Errorf("failed to parse takerBuyQuoteAssetVolume: %w", err)
	}

	return types.Kline{
		OpenTime:                 openTime,
		Open:                     open,
		High:                     high,
		Low:                      low,
		Close:                    close,
		Volume:                   volume,
		CloseTime:                closeTime,
		QuoteAssetVolume:         quoteAssetVolume,
		NumberOfTrades:           int(numberOfTrades),
		TakerBuyBaseAssetVolume:  takerBuyBaseAssetVolume,
		TakerBuyQuoteAssetVolume: takerBuyQuoteAssetVolume,
	}, nil
}
