#!/bin/bash
# ==============================================================================
# Deploy Script for Vyx Fly Machine
# ==============================================================================
# Builds and deploys Docker image to Fly.io
# Usage: ./scripts/deploy.sh [--no-cache]
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
DOCKERFILE="Dockerfile.prod"
REGION="${REGION:-sjc}"  # Default to San Jose (close to SF)

echo -e "${BLUE}===================================================================${NC}"
echo -e "${BLUE}Deploying Vyx Fly Machine${NC}"
echo -e "${BLUE}===================================================================${NC}"
echo ""

# Parse arguments
EXTRA_FLAGS=""
if [[ "$1" == "--no-cache" ]]; then
    EXTRA_FLAGS="--no-cache"
    echo -e "${YELLOW}Deploying with --no-cache flag${NC}"
fi

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

# Change to project directory
cd "$PROJECT_DIR"

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

echo -e "${BLUE}Fly App: ${NC}$FLY_APP_NAME"
echo -e "${BLUE}Region: ${NC}$REGION"
echo -e "${BLUE}Dockerfile: ${NC}$DOCKERFILE"
echo ""

# Check if app exists
if ! fly apps list | grep -q "$FLY_APP_NAME"; then
    echo -e "${YELLOW}App '$FLY_APP_NAME' does not exist${NC}"
    echo -e "${YELLOW}Creating app...${NC}"
    fly apps create "$FLY_APP_NAME" --org personal
fi

# Deploy to Fly.io
echo -e "${YELLOW}Starting deployment...${NC}"
echo ""

fly deploy \
    --app "$FLY_APP_NAME" \
    --dockerfile "$DOCKERFILE" \
    $EXTRA_FLAGS

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}===================================================================${NC}"
    echo -e "${GREEN}✅ Deployment successful!${NC}"
    echo -e "${GREEN}===================================================================${NC}"
    echo ""

    # Tag the deployed image as :latest for stable reference
    echo -e "${YELLOW}Tagging deployed image as :latest...${NC}"

    # Get the latest release image
    DEPLOYED_IMAGE=$(fly releases --app "$FLY_APP_NAME" --image -j 2>/dev/null | grep -o '"image":"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ -n "$DEPLOYED_IMAGE" ]; then
        echo -e "${BLUE}Deployed image: ${NC}$DEPLOYED_IMAGE"

        # Tag the image as :latest using Fly's built-in command
        # This creates an alias in the Fly registry
        LATEST_IMAGE="registry.fly.io/${FLY_APP_NAME}:latest"
        echo -e "${BLUE}Creating alias: ${NC}$LATEST_IMAGE"

        # Use fly deploy with --build-only and --image-label to create the :latest tag
        # Alternative: manually tag using docker if authenticated to Fly registry
        fly image tag "$DEPLOYED_IMAGE" latest --app "$FLY_APP_NAME" 2>/dev/null || {
            echo -e "${YELLOW}⚠️  fly image tag not available, using docker method...${NC}"

            # Authenticate docker to Fly registry
            fly auth docker 2>/dev/null || true

            # Pull, tag, and push
            docker pull "$DEPLOYED_IMAGE" && \
            docker tag "$DEPLOYED_IMAGE" "$LATEST_IMAGE" && \
            docker push "$LATEST_IMAGE"
        }

        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Image tagged as :latest${NC}"
            echo -e "${BLUE}Latest image available at: ${NC}$LATEST_IMAGE"
        else
            echo -e "${YELLOW}⚠️  Could not tag as :latest (non-fatal)${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  Could not determine deployed image, skipping :latest tag${NC}"
    fi
    echo ""

    echo -e "${BLUE}App status:${NC}"
    fly status --app "$FLY_APP_NAME"
    echo ""
    echo -e "${YELLOW}Useful commands:${NC}"
    echo -e "  View logs:    ${GREEN}fly logs --app $FLY_APP_NAME${NC}"
    echo -e "  SSH into app: ${GREEN}fly ssh console --app $FLY_APP_NAME${NC}"
    echo -e "  Check status: ${GREEN}fly status --app $FLY_APP_NAME${NC}"
    echo -e "  View machines:${GREEN}fly machines list --app $FLY_APP_NAME${NC}"
    echo ""
else
    echo -e "${RED}===================================================================${NC}"
    echo -e "${RED}❌ Deployment failed!${NC}"
    echo -e "${RED}===================================================================${NC}"
    exit 1
fi
