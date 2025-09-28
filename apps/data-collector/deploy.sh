#!/bin/bash

# Deploy script for vyx-data-collector with Redis fix
# This script sets the new Redis credentials and deploys the fixed code

echo "🚀 Starting deployment of vyx-data-collector with Redis optimization fix..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if fly CLI is installed
if ! command -v fly &> /dev/null; then
    echo -e "${RED}❌ Fly CLI is not installed. Please install it first:${NC}"
    echo "  curl -L https://fly.io/install.sh | sh"
    exit 1
fi

echo -e "${YELLOW}📝 Step 1: Setting Redis secrets in Fly.io...${NC}"
fly secrets set \
  UPSTASH_REDIS_URL="https://dashing-gorilla-12954.upstash.io" \
  UPSTASH_REDIS_TOKEN="ATKaAAIncDJhNjNkYzlhNzg0MGU0YmNlYjIzY2FkZTVjMTMwZTMxY3AyMTI5NTQ" \
  SYMBOLS="BTCUSDT,ETHUSDT,BNBUSDT" \
  -a vyx-data-collector

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to set secrets. Please check your Fly.io authentication.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Secrets updated successfully!${NC}"
echo ""

echo -e "${YELLOW}📦 Step 2: Building the application...${NC}"
pnpm build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed. Please check for TypeScript errors.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build successful!${NC}"
echo ""

echo -e "${YELLOW}🚁 Step 3: Deploying to Fly.io...${NC}"
fly deploy

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Deployment failed. Checking logs...${NC}"
    fly logs -a vyx-data-collector -n 50
    exit 1
fi

echo -e "${GREEN}✅ Deployment successful!${NC}"
echo ""

echo -e "${YELLOW}📊 Step 4: Checking application status...${NC}"
fly status -a vyx-data-collector

echo ""
echo -e "${YELLOW}📋 Step 5: Monitoring logs (press Ctrl+C to exit)...${NC}"
echo -e "${GREEN}You should see:${NC}"
echo "  - 'WebSocket connected' message"
echo "  - 'CRITICAL FIX: Only write closed candles' in the code"
echo "  - No Redis rate limit errors"
echo "  - Ticker throttling active (1/second)"
echo ""
echo -e "${YELLOW}Starting log stream...${NC}"
fly logs -a vyx-data-collector

echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo ""
echo "Redis usage should now be:"
echo "  - Before: ~300,000+ commands/minute"
echo "  - After:  ~1,400 commands/minute (99.5% reduction!)"
echo ""
echo "Monitor your Upstash dashboard to confirm the reduction."