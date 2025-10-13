package scheduler

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// ParseInterval converts a Binance interval string to a duration
// Supports: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w, 1M
func ParseInterval(interval string) (time.Duration, error) {
	if interval == "" {
		return 0, fmt.Errorf("empty interval")
	}

	// Extract number and unit
	var value int
	var unit string

	// Handle special cases
	switch interval {
	case "1m":
		return 1 * time.Minute, nil
	case "5m":
		return 5 * time.Minute, nil
	case "15m":
		return 15 * time.Minute, nil
	case "30m":
		return 30 * time.Minute, nil
	case "1h":
		return 1 * time.Hour, nil
	case "4h":
		return 4 * time.Hour, nil
	case "1d":
		return 24 * time.Hour, nil
	case "1w":
		return 7 * 24 * time.Hour, nil
	}

	// Parse generic format (e.g., "3m", "2h")
	for i, ch := range interval {
		if ch >= '0' && ch <= '9' {
			continue
		}
		// Found the unit
		numStr := interval[:i]
		unit = interval[i:]
		var err error
		value, err = strconv.Atoi(numStr)
		if err != nil {
			return 0, fmt.Errorf("invalid interval number: %s", numStr)
		}
		break
	}

	if value == 0 || unit == "" {
		return 0, fmt.Errorf("invalid interval format: %s", interval)
	}

	// Convert based on unit
	switch strings.ToLower(unit) {
	case "s":
		return time.Duration(value) * time.Second, nil
	case "m":
		return time.Duration(value) * time.Minute, nil
	case "h":
		return time.Duration(value) * time.Hour, nil
	case "d":
		return time.Duration(value) * 24 * time.Hour, nil
	case "w":
		return time.Duration(value) * 7 * 24 * time.Hour, nil
	default:
		return 0, fmt.Errorf("unsupported interval unit: %s", unit)
	}
}

// GetCandleOpenTime rounds a timestamp down to the nearest candle boundary
func GetCandleOpenTime(now time.Time, interval string) (time.Time, error) {
	duration, err := ParseInterval(interval)
	if err != nil {
		return time.Time{}, err
	}

	// Truncate to UTC midnight for daily and above
	if duration >= 24*time.Hour {
		// For daily candles and above, align to UTC midnight
		return now.Truncate(duration), nil
	}

	// For intraday intervals, truncate normally
	return now.Truncate(duration), nil
}

// IsValidInterval checks if an interval string is supported
func IsValidInterval(interval string) bool {
	_, err := ParseInterval(interval)
	return err == nil
}

// SupportedIntervals returns a list of commonly used intervals
func SupportedIntervals() []string {
	return []string{
		"1m", "5m", "15m", "30m",
		"1h", "4h",
		"1d",
	}
}
