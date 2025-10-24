#!/bin/bash
# ==============================================================================
# Setup Secrets Script for Vyx Fly Machine
# ==============================================================================
# Sets required secrets in Fly.io for the app
# Usage: ./scripts/setup-secrets.sh
# ==============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
FLY_APP_NAME="${FLY_APP_NAME:-vyx-app}"

echo -e "${BLUE}===================================================================${NC}"
echo -e "${BLUE}Setting up Fly.io Secrets for Vyx${NC}"
echo -e "${BLUE}===================================================================${NC}"
echo ""

# Check if fly CLI is installed
if ! command -v fly &> /dev/null; then
    echo -e "${RED}Error: fly CLI not found${NC}"
    echo -e "${YELLOW}Install it from: https://fly.io/docs/hands-on/install-flyctl/${NC}"
    exit 1
fi

# Check if logged in to Fly
if ! fly auth whoami &> /dev/null; then
    echo -e "${RED}Error: Not logged in to Fly.io${NC}"
    echo -e "${YELLOW}Run: fly auth login${NC}"
    exit 1
fi

echo -e "${BLUE}App: ${NC}$FLY_APP_NAME"
echo ""

# Load environment variables from .env.local if it exists
ENV_FILE="../../../.env.local"
if [ -f "$ENV_FILE" ]; then
    echo -e "${GREEN}Loading environment from .env.local${NC}"
    export $(grep -v '^#' "$ENV_FILE" | xargs)
else
    echo -e "${YELLOW}Warning: .env.local not found${NC}"
fi

# Required secrets
REQUIRED_SECRETS=(
    "SUPABASE_URL"
    "SUPABASE_SERVICE_ROLE_KEY"
    "GEMINI_API_KEY"
)

# Optional secrets (with defaults)
declare -A OPTIONAL_SECRETS=(
    ["FLY_APP_NAME"]="vyx-app"
    ["DOCKER_IMAGE"]="registry.fly.io/vyx-app:latest"
)

echo -e "${YELLOW}Checking required secrets...${NC}"
echo ""

# Check if all required secrets are set
MISSING_SECRETS=()
for secret in "${REQUIRED_SECRETS[@]}"; do
    if [ -z "${!secret}" ]; then
        MISSING_SECRETS+=("$secret")
        echo -e "${RED}✗ $secret${NC} - NOT SET"
    else
        echo -e "${GREEN}✓ $secret${NC} - Set (${#!secret} chars)"
    fi
done

echo ""

if [ ${#MISSING_SECRETS[@]} -gt 0 ]; then
    echo -e "${RED}Error: Missing required secrets:${NC}"
    for secret in "${MISSING_SECRETS[@]}"; do
        echo -e "  - $secret"
    done
    echo ""
    echo -e "${YELLOW}Please set them in .env.local or export them:${NC}"
    echo -e "  export SUPABASE_URL='...'"
    echo -e "  export SUPABASE_SERVICE_ROLE_KEY='...'"
    echo -e "  export GEMINI_API_KEY='...'"
    exit 1
fi

# Confirm before setting secrets
echo -e "${YELLOW}This will set the following secrets in Fly.io app: $FLY_APP_NAME${NC}"
echo ""
for secret in "${REQUIRED_SECRETS[@]}"; do
    echo -e "  - $secret"
done
for secret in "${!OPTIONAL_SECRETS[@]}"; do
    echo -e "  - $secret (optional)"
done
echo ""
read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Aborted.${NC}"
    exit 0
fi

# Set required secrets
echo ""
echo -e "${YELLOW}Setting secrets...${NC}"

fly secrets set \
    --app "$FLY_APP_NAME" \
    SUPABASE_URL="$SUPABASE_URL" \
    SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
    GEMINI_API_KEY="$GEMINI_API_KEY"

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}===================================================================${NC}"
    echo -e "${GREEN}✅ Secrets set successfully!${NC}"
    echo -e "${GREEN}===================================================================${NC}"
    echo ""
    echo -e "${YELLOW}Verify secrets:${NC}"
    echo -e "  ${GREEN}fly secrets list --app $FLY_APP_NAME${NC}"
    echo ""
    echo -e "${YELLOW}Next step:${NC}"
    echo -e "  ${GREEN}./scripts/deploy.sh${NC}"
    echo ""
else
    echo -e "${RED}Failed to set secrets${NC}"
    exit 1
fi
