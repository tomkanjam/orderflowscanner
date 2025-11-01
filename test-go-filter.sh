#!/bin/bash

# Test the Stoch RSI filter on the Go server

FILTER_CODE='// Get klines for 1m timeframe
klines := data.Klines["1m"]
if klines == nil || len(klines) < 50 {
    return false
}

// Calculate Stochastic RSI
stoch := indicators.CalculateStochastic(klines, 14, 3)
if stoch == nil || len(stoch.K) == 0 {
    return false
}

// Get latest Stochastic RSI K line value
latestK := stoch.K[len(stoch.K)-1]

// Check if K line is below 40
return latestK < 40'

echo "=== Testing Stoch RSI filter on Go server ==="
echo "Filter trader ID: 53460502-f27f-482f-8ddf-e5888fe30c4d"
echo ""

# Call the Go server's run-screener endpoint
curl -s -X POST https://vyx-kline-server.fly.dev/run-screener \
  -H "Content-Type: application/json" \
  -d "{
    \"trader_id\": \"53460502-f27f-482f-8ddf-e5888fe30c4d\",
    \"filter_code\": $(echo "$FILTER_CODE" | jq -Rs .),
    \"required_timeframes\": [\"1m\"],
    \"limit\": 5
  }" | jq '.'
