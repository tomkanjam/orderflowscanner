package main

import (
	"container/ring"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/rs/cors"
)

// Kline represents a candlestick data point
type Kline struct {
	OpenTime            int64   `json:"t"`
	Open                string  `json:"o"`
	High                string  `json:"h"`
	Low                 string  `json:"l"`
	Close               string  `json:"c"`
	Volume              string  `json:"v"`
	CloseTime           int64   `json:"T"`
	QuoteVolume         string  `json:"q"`
	Trades              int     `json:"n"`
	TakerBuyBaseVolume  string  `json:"V"`
	TakerBuyQuoteVolume string  `json:"Q"`
	IsClosed            bool    `json:"x"`
}

// Ticker represents current price data
type Ticker struct {
	Symbol             string  `json:"s"`
	Price              string  `json:"c"`
	Volume             string  `json:"v"`
	QuoteVolume        string  `json:"q"`
	PriceChangePercent string  `json:"P"`
	High               string  `json:"h"`
	Low                string  `json:"l"`
	UpdateTime         int64   `json:"t"`
}

// Store holds all market data in memory
type Store struct {
	mu      sync.RWMutex
	klines  map[string]*ring.Ring // "BTCUSDT:1m" -> circular buffer of 500 klines
	tickers map[string]*Ticker    // "BTCUSDT" -> latest ticker
	clients map[*websocket.Conn]bool
	clientsMu sync.RWMutex
}

// Global store instance
var store = &Store{
	klines:  make(map[string]*ring.Ring),
	tickers: make(map[string]*Ticker),
	clients: make(map[*websocket.Conn]bool),
}

// WebSocket upgrader
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins in development
	},
}

// Binance WebSocket message types
type BinanceKlineEvent struct {
	EventType string `json:"e"`
	Symbol    string `json:"s"`
	Kline     struct {
		StartTime           int64  `json:"t"`
		CloseTime           int64  `json:"T"`
		Symbol              string `json:"s"`
		Interval            string `json:"i"`
		Open                string `json:"o"`
		Close               string `json:"c"`
		High                string `json:"h"`
		Low                 string `json:"l"`
		Volume              string `json:"v"`
		Trades              int    `json:"n"`
		IsClosed            bool   `json:"x"`
		QuoteVolume         string `json:"q"`
		TakerBuyBaseVolume  string `json:"V"`
		TakerBuyQuoteVolume string `json:"Q"`
	} `json:"k"`
}

type BinanceTickerEvent struct {
	EventType          string `json:"e"`
	Symbol             string `json:"s"`
	Price              string `json:"c"`
	Volume             string `json:"v"`
	QuoteVolume        string `json:"q"`
	PriceChangePercent string `json:"P"`
	High               string `json:"h"`
	Low                string `json:"l"`
	EventTime          int64  `json:"E"`
}

func (s *Store) StoreKline(symbol, interval string, kline *Kline) {
	key := fmt.Sprintf("%s:%s", symbol, interval)

	s.mu.Lock()
	defer s.mu.Unlock()

	// Get or create ring buffer for this symbol:interval
	r, exists := s.klines[key]
	if !exists {
		r = ring.New(500) // Store last 500 klines
		s.klines[key] = r
	}

	// Only store closed klines
	if kline.IsClosed {
		r.Value = kline
		s.klines[key] = r.Next()
	}
}

func (s *Store) StoreTicker(ticker *Ticker) {
	s.mu.Lock()
	s.tickers[ticker.Symbol] = ticker
	s.mu.Unlock()

	// Broadcast to WebSocket clients
	s.broadcastTicker(ticker)
}

func (s *Store) GetKlines(symbol, interval string, limit int) []Kline {
	key := fmt.Sprintf("%s:%s", symbol, interval)

	s.mu.RLock()
	defer s.mu.RUnlock()

	r, exists := s.klines[key]
	if !exists {
		return []Kline{}
	}

	klines := make([]Kline, 0, limit)
	r.Do(func(x interface{}) {
		if x != nil && len(klines) < limit {
			klines = append(klines, *x.(*Kline))
		}
	})

	// Return in chronological order
	return klines
}

func (s *Store) GetTicker(symbol string) *Ticker {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.tickers[symbol]
}

func (s *Store) GetAllTickers() map[string]*Ticker {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make(map[string]*Ticker)
	for k, v := range s.tickers {
		result[k] = v
	}
	return result
}

func (s *Store) broadcastTicker(ticker *Ticker) {
	s.clientsMu.RLock()
	defer s.clientsMu.RUnlock()

	msg, _ := json.Marshal(map[string]interface{}{
		"type": "ticker",
		"data": ticker,
	})

	for client := range s.clients {
		client.WriteMessage(websocket.TextMessage, msg)
	}
}

// Connect to Binance WebSocket streams
func connectBinance(symbols []string, intervals []string) {
	streams := make([]string, 0)

	// Build stream list
	for _, symbol := range symbols {
		lowerSymbol := strings.ToLower(symbol)

		// Add ticker stream
		streams = append(streams, fmt.Sprintf("%s@ticker", lowerSymbol))

		// Add kline streams
		for _, interval := range intervals {
			streams = append(streams, fmt.Sprintf("%s@kline_%s", lowerSymbol, interval))
		}
	}

	// Binance allows max 1024 streams per connection
	// Split into chunks if needed
	const maxStreamsPerConn = 200
	for i := 0; i < len(streams); i += maxStreamsPerConn {
		end := i + maxStreamsPerConn
		if end > len(streams) {
			end = len(streams)
		}

		chunk := streams[i:end]
		go maintainBinanceConnection(chunk)
	}
}

func maintainBinanceConnection(streams []string) {
	for {
		// Binance WebSocket endpoint for combined streams
		url := "wss://stream.binance.com:9443/ws"

		log.Printf("Connecting to Binance with %d streams...", len(streams))

		conn, _, err := websocket.DefaultDialer.Dial(url, nil)
		if err != nil {
			log.Printf("Failed to connect: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}

		log.Printf("Connected to Binance WebSocket")

		// Subscribe to streams
		subMsg := map[string]interface{}{
			"method": "SUBSCRIBE",
			"params": streams,
			"id":     1,
		}
		if err := conn.WriteJSON(subMsg); err != nil {
			log.Printf("Failed to subscribe: %v", err)
			conn.Close()
			time.Sleep(1 * time.Second)
			continue
		}

		// Handle messages
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				log.Printf("Read error: %v", err)
				conn.Close()
				break
			}

			// Parse message
			var msg map[string]interface{}
			if err := json.Unmarshal(message, &msg); err != nil {
				continue
			}

			// Skip subscription confirmation
			if _, ok := msg["result"]; ok {
				continue
			}

			// Get event type
			eventType, _ := msg["e"].(string)

			switch eventType {
			case "kline":
				handleKlineEvent(msg)
			case "24hrTicker":
				handleTickerEvent(msg)
			}
		}

		log.Println("Reconnecting to Binance...")
		time.Sleep(1 * time.Second)
	}
}

func handleKlineEvent(data map[string]interface{}) {
	k, ok := data["k"].(map[string]interface{})
	if !ok {
		return
	}

	symbol, _ := k["s"].(string)
	interval, _ := k["i"].(string)

	kline := &Kline{
		OpenTime:            int64(k["t"].(float64)),
		Open:                k["o"].(string),
		High:                k["h"].(string),
		Low:                 k["l"].(string),
		Close:               k["c"].(string),
		Volume:              k["v"].(string),
		CloseTime:           int64(k["T"].(float64)),
		QuoteVolume:         k["q"].(string),
		Trades:              int(k["n"].(float64)),
		TakerBuyBaseVolume:  k["V"].(string),
		TakerBuyQuoteVolume: k["Q"].(string),
		IsClosed:            k["x"].(bool),
	}

	store.StoreKline(symbol, interval, kline)
}

func handleTickerEvent(data map[string]interface{}) {
	ticker := &Ticker{
		Symbol:             data["s"].(string),
		Price:              data["c"].(string),
		Volume:             data["v"].(string),
		QuoteVolume:        data["q"].(string),
		PriceChangePercent: data["P"].(string),
		High:               data["h"].(string),
		Low:                data["l"].(string),
		UpdateTime:         int64(data["E"].(float64)),
	}

	store.StoreTicker(ticker)
}

// Authentication middleware
func checkAPIKey(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		expectedKey := os.Getenv("API_KEY")

		// If no API key is set, allow all requests (for backward compatibility)
		if expectedKey == "" {
			handler(w, r)
			return
		}

		// Check for API key in header
		apiKey := r.Header.Get("X-API-Key")
		if apiKey == "" {
			// Also check for Bearer token
			auth := r.Header.Get("Authorization")
			if strings.HasPrefix(auth, "Bearer ") {
				apiKey = strings.TrimPrefix(auth, "Bearer ")
			}
		}

		if apiKey != expectedKey {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		handler(w, r)
	}
}

// HTTP Handlers
func handleGetKlines(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	symbol := vars["symbol"]
	interval := vars["interval"]
	limit := 100 // Default limit

	klines := store.GetKlines(symbol, interval, limit)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"symbol":   symbol,
		"interval": interval,
		"klines":   klines,
		"count":    len(klines),
	})
}

func handleGetTicker(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	symbol := vars["symbol"]

	ticker := store.GetTicker(symbol)
	if ticker == nil {
		http.Error(w, "Symbol not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ticker)
}

func handleGetAllTickers(w http.ResponseWriter, r *http.Request) {
	tickers := store.GetAllTickers()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tickers)
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	// Register client
	store.clientsMu.Lock()
	store.clients[conn] = true
	store.clientsMu.Unlock()

	// Remove client on disconnect
	defer func() {
		store.clientsMu.Lock()
		delete(store.clients, conn)
		store.clientsMu.Unlock()
	}()

	// Keep connection alive
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "healthy",
		"time":   time.Now().Unix(),
	})
}

func getTopSymbols() []string {
	// Top 500 USDT pairs by volume
	// In production, fetch this dynamically
	return []string{
		"BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT", "SOLUSDT",
		"ADAUSDT", "DOGEUSDT", "AVAXUSDT", "TRXUSDT", "MATICUSDT",
		// Add more symbols up to 500...
		// For now, let's start with 50 for testing
	}
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Get symbols from environment or use defaults
	symbolsEnv := os.Getenv("SYMBOLS")
	var symbols []string
	if symbolsEnv != "" {
		symbols = strings.Split(symbolsEnv, ",")
	} else {
		symbols = getTopSymbols()
	}

	intervals := []string{"1m", "5m", "15m", "1h"}

	log.Printf("Starting kline server for %d symbols", len(symbols))

	// Connect to Binance
	connectBinance(symbols, intervals)

	// Setup routes
	router := mux.NewRouter()
	router.HandleFunc("/health", handleHealth).Methods("GET") // Health check doesn't need auth
	router.HandleFunc("/klines/{symbol}/{interval}", checkAPIKey(handleGetKlines)).Methods("GET")
	router.HandleFunc("/ticker/{symbol}", checkAPIKey(handleGetTicker)).Methods("GET")
	router.HandleFunc("/tickers", checkAPIKey(handleGetAllTickers)).Methods("GET")
	router.HandleFunc("/ws", handleWebSocket) // WebSocket doesn't need auth for now

	// Setup CORS
	c := cors.New(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders: []string{"*"},
	})

	handler := c.Handler(router)

	log.Printf("Server starting on port %s", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatal(err)
	}
}