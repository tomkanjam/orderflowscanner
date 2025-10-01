#!/bin/bash
# Deploy script for Fly.io Machine
# Usage: ./deploy.sh [user_id] [region]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if flyctl is installed
if ! command -v flyctl &> /dev/null; then
    echo -e "${RED}Error: flyctl is not installed${NC}"
    echo "Install it from: https://fly.io/docs/hands-on/install-flyctl/"
    exit 1
fi

# Check if user is authenticated
if ! flyctl auth whoami &> /dev/null; then
    echo -e "${YELLOW}Not authenticated with Fly.io${NC}"
    echo "Running: flyctl auth login"
    flyctl auth login
fi

# Get user ID from argument or prompt
USER_ID=${1:-}
if [ -z "$USER_ID" ]; then
    read -p "Enter User ID: " USER_ID
fi

# Get region from argument or prompt
REGION=${2:-sin}
echo -e "${GREEN}Using region: $REGION${NC}"

# App name
APP_NAME="trademind-screener-${USER_ID}"

echo -e "${GREEN}Deploying machine for user: $USER_ID${NC}"
echo -e "${GREEN}App name: $APP_NAME${NC}"

# Check if app exists
if ! flyctl apps list | grep -q "$APP_NAME"; then
    echo -e "${YELLOW}App does not exist, creating...${NC}"
    flyctl apps create "$APP_NAME"
else
    echo -e "${GREEN}App exists${NC}"
fi

# Prompt for secrets if not set
echo ""
echo -e "${YELLOW}Checking secrets...${NC}"

# Check if secrets are set
SECRETS_SET=true
if ! flyctl secrets list -a "$APP_NAME" | grep -q "SUPABASE_URL"; then
    SECRETS_SET=false
fi

if [ "$SECRETS_SET" = false ]; then
    echo -e "${YELLOW}Secrets not set. Please provide:${NC}"

    read -p "Supabase URL: " SUPABASE_URL
    read -p "Supabase Service Key: " SUPABASE_SERVICE_KEY

    echo -e "${GREEN}Setting secrets...${NC}"
    flyctl secrets set \
        USER_ID="$USER_ID" \
        SUPABASE_URL="$SUPABASE_URL" \
        SUPABASE_SERVICE_KEY="$SUPABASE_SERVICE_KEY" \
        MACHINE_REGION="$REGION" \
        -a "$APP_NAME"
fi

# Build and deploy
echo ""
echo -e "${GREEN}Building and deploying...${NC}"
flyctl deploy -a "$APP_NAME" --region "$REGION"

# Show deployment info
echo ""
echo -e "${GREEN}Deployment complete!${NC}"
echo ""
echo "App: $APP_NAME"
echo "Region: $REGION"
echo "Status: $(flyctl status -a "$APP_NAME" | head -n 1)"
echo ""
echo "Useful commands:"
echo "  flyctl logs -a $APP_NAME         # View logs"
echo "  flyctl status -a $APP_NAME       # Check status"
echo "  flyctl ssh console -a $APP_NAME  # SSH into machine"
echo "  flyctl machine stop -a $APP_NAME # Stop machine"
echo ""
