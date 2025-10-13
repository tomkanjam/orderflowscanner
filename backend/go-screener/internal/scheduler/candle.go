package scheduler

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/vyx/go-screener/internal/eventbus"
)

// CandleScheduler generates candle open events at precise boundaries
type CandleScheduler struct {
	eventBus  *eventbus.EventBus
	intervals []string // Intervals to monitor (e.g., "1m", "5m", "15m")

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// Config holds scheduler configuration
type Config struct {
	Intervals   []string      // Intervals to schedule
	TickRate    time.Duration // How often to check for candle boundaries (default: 100ms)
}

// DefaultConfig returns default scheduler configuration
func DefaultConfig() *Config {
	return &Config{
		Intervals: []string{"1m", "5m", "15m", "1h", "4h", "1d"},
		TickRate:  100 * time.Millisecond,
	}
}

// NewCandleScheduler creates a new candle scheduler
func NewCandleScheduler(eventBus *eventbus.EventBus, config *Config) *CandleScheduler {
	if config == nil {
		config = DefaultConfig()
	}

	ctx, cancel := context.WithCancel(context.Background())

	return &CandleScheduler{
		eventBus:  eventBus,
		intervals: config.Intervals,
		ctx:       ctx,
		cancel:    cancel,
	}
}

// Start begins candle boundary detection for all intervals
func (s *CandleScheduler) Start() error {
	log.Printf("[CandleScheduler] Starting with intervals: %v", s.intervals)

	// Start a goroutine for each interval
	for _, interval := range s.intervals {
		s.wg.Add(1)
		go s.scheduleInterval(interval)
	}

	log.Printf("[CandleScheduler] ✅ Started %d interval schedulers", len(s.intervals))
	return nil
}

// Stop gracefully shuts down the scheduler
func (s *CandleScheduler) Stop() error {
	log.Printf("[CandleScheduler] Shutting down...")

	// Cancel context to stop all goroutines
	s.cancel()

	// Wait for all goroutines to finish
	s.wg.Wait()

	log.Printf("[CandleScheduler] ✅ Stopped successfully")
	return nil
}

// scheduleInterval monitors a single interval and emits candle events
func (s *CandleScheduler) scheduleInterval(interval string) {
	defer s.wg.Done()

	log.Printf("[CandleScheduler] Started scheduler for %s", interval)

	// Parse interval duration
	duration, err := ParseInterval(interval)
	if err != nil {
		log.Printf("[CandleScheduler] Error parsing interval %s: %v", interval, err)
		return
	}

	// Ticker for checking boundaries
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	// Track last candle time to detect boundaries
	var lastCandleTime time.Time

	for {
		select {
		case <-s.ctx.Done():
			log.Printf("[CandleScheduler] Stopped scheduler for %s", interval)
			return

		case now := <-ticker.C:
			// Calculate current candle open time
			candleTime := now.Truncate(duration)

			// Check if we crossed a boundary (new candle opened)
			if candleTime != lastCandleTime && !lastCandleTime.IsZero() {
				// New candle opened! Publish event
				event := &eventbus.CandleEvent{
					Symbol:   "*", // Wildcard - executor will filter by active traders
					Interval: interval,
					OpenTime: candleTime,
				}

				s.eventBus.PublishCandleEvent(event)

				log.Printf("[CandleScheduler] 📊 Candle open: %s at %s",
					interval, candleTime.Format("15:04:05"))
			}

			// Update last candle time
			lastCandleTime = candleTime
		}
	}
}

// GetIntervals returns the list of monitored intervals
func (s *CandleScheduler) GetIntervals() []string {
	return s.intervals
}

// AddInterval dynamically adds a new interval to monitor
func (s *CandleScheduler) AddInterval(interval string) error {
	// Validate interval
	if !IsValidInterval(interval) {
		return ErrInvalidInterval
	}

	// Check if already monitoring
	for _, existing := range s.intervals {
		if existing == interval {
			return nil // Already monitoring
		}
	}

	// Add to list
	s.intervals = append(s.intervals, interval)

	// Start scheduler for this interval
	s.wg.Add(1)
	go s.scheduleInterval(interval)

	log.Printf("[CandleScheduler] Added new interval: %s", interval)
	return nil
}

// Custom errors
var (
	ErrInvalidInterval = fmt.Errorf("invalid interval format")
)
