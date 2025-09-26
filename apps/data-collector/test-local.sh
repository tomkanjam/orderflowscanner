#!/bin/bash

echo "Testing Data Collector Service Locally"
echo "======================================"
echo ""
echo "This script will run the data collector with a test Redis instance."
echo "You need to:"
echo "1. Create an Upstash Redis database at https://console.upstash.com/"
echo "2. Copy the REST URL and Token"
echo "3. Create a .env file from .env.example"
echo ""
echo "Press Ctrl+C to stop the service"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
  echo "ERROR: .env file not found!"
  echo "Please copy .env.example to .env and add your Upstash credentials"
  exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Check for required variables
if [ -z "$UPSTASH_REDIS_URL" ] || [ -z "$UPSTASH_REDIS_TOKEN" ]; then
  echo "ERROR: Missing required environment variables!"
  echo "Please set UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN in .env"
  exit 1
fi

# Use a small set of symbols for testing
export SYMBOLS="BTCUSDT,ETHUSDT,BNBUSDT"

echo "Starting data collector with symbols: $SYMBOLS"
echo ""

# Run the service
pnpm dev