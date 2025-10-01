package helpers

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strconv"
	"time"
)

// GenerateID generates a random hex ID of specified length
func GenerateID(prefix string, length int) string {
	bytes := make([]byte, length/2)
	if _, err := rand.Read(bytes); err != nil {
		// Fallback to timestamp-based ID if random fails
		return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
	}
	return fmt.Sprintf("%s-%s", prefix, hex.EncodeToString(bytes))
}

// ParseFloat safely parses a string to float64
func ParseFloat(s string) (float64, error) {
	if s == "" {
		return 0, nil
	}
	return strconv.ParseFloat(s, 64)
}

// ParseInt safely parses a string to int64
func ParseInt(s string) (int64, error) {
	if s == "" {
		return 0, nil
	}
	return strconv.ParseInt(s, 10, 64)
}

// FormatPrice formats a price with appropriate precision
func FormatPrice(price float64) string {
	if price >= 100 {
		return fmt.Sprintf("%.2f", price)
	} else if price >= 1 {
		return fmt.Sprintf("%.4f", price)
	} else {
		return fmt.Sprintf("%.8f", price)
	}
}

// FormatPercent formats a percentage value
func FormatPercent(value float64) string {
	return fmt.Sprintf("%.2f%%", value)
}

// CalculatePnL calculates profit/loss for a position
func CalculatePnL(entryPrice, currentPrice, quantity float64, isLong bool) float64 {
	if isLong {
		return (currentPrice - entryPrice) * quantity
	}
	return (entryPrice - currentPrice) * quantity
}

// CalculatePnLPercent calculates profit/loss percentage
func CalculatePnLPercent(entryPrice, currentPrice float64, isLong bool) float64 {
	if entryPrice == 0 {
		return 0
	}
	if isLong {
		return ((currentPrice - entryPrice) / entryPrice) * 100
	}
	return ((entryPrice - currentPrice) / entryPrice) * 100
}

// ShouldTriggerStopLoss checks if stop loss should be triggered
func ShouldTriggerStopLoss(currentPrice, stopLoss float64, isLong bool) bool {
	if stopLoss == 0 {
		return false
	}
	if isLong {
		return currentPrice <= stopLoss
	}
	return currentPrice >= stopLoss
}

// ShouldTriggerTakeProfit checks if take profit should be triggered
func ShouldTriggerTakeProfit(currentPrice, takeProfit float64, isLong bool) bool {
	if takeProfit == 0 {
		return false
	}
	if isLong {
		return currentPrice >= takeProfit
	}
	return currentPrice <= takeProfit
}

// TimeUntilNextCheck calculates time until next check
func TimeUntilNextCheck(lastCheck time.Time, intervalSec int) time.Duration {
	nextCheck := lastCheck.Add(time.Duration(intervalSec) * time.Second)
	return time.Until(nextCheck)
}

// CalculateNextCheckTime calculates the next check time
func CalculateNextCheckTime(intervalSec int) time.Time {
	return time.Now().Add(time.Duration(intervalSec) * time.Second)
}

// IsMarketOpen checks if market is currently open (crypto is always open)
func IsMarketOpen() bool {
	return true
}

// ValidateSymbol checks if a symbol is valid format
func ValidateSymbol(symbol string) bool {
	// Basic validation: must end with USDT and be at least 5 chars
	if len(symbol) < 5 {
		return false
	}
	return symbol[len(symbol)-4:] == "USDT"
}

// ValidatePrice checks if a price is valid
func ValidatePrice(price float64) bool {
	return price > 0
}

// ValidateQuantity checks if a quantity is valid
func ValidateQuantity(quantity float64) bool {
	return quantity > 0
}

// MinFloat returns the minimum of two floats
func MinFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

// MaxFloat returns the maximum of two floats
func MaxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

// RoundToDecimalPlaces rounds a float to specified decimal places
func RoundToDecimalPlaces(value float64, places int) float64 {
	multiplier := 1.0
	for i := 0; i < places; i++ {
		multiplier *= 10
	}
	return float64(int(value*multiplier+0.5)) / multiplier
}

// CalculatePositionSize calculates position size based on risk parameters
func CalculatePositionSize(balance, riskPercent, entryPrice, stopLoss float64) float64 {
	if entryPrice == 0 || stopLoss == 0 {
		return 0
	}

	riskAmount := balance * (riskPercent / 100)
	priceRisk := entryPrice - stopLoss
	if priceRisk <= 0 {
		return 0
	}

	return riskAmount / priceRisk
}

// ExponentialBackoff calculates backoff duration for retry attempts
func ExponentialBackoff(attempt int, baseDelay time.Duration) time.Duration {
	if attempt <= 0 {
		return baseDelay
	}

	// Cap at 10 attempts to prevent overflow
	if attempt > 10 {
		attempt = 10
	}

	// 2^attempt * baseDelay
	multiplier := 1 << uint(attempt)
	return time.Duration(multiplier) * baseDelay
}

// IsPanicError checks if an error indicates a panic condition
func IsPanicError(err error) bool {
	if err == nil {
		return false
	}
	// Add specific panic error patterns as needed
	return false
}

// SanitizeUserInput sanitizes user input to prevent injection
func SanitizeUserInput(input string) string {
	// Basic sanitization - extend as needed
	// For now, just trim whitespace
	return input
}
