#!/bin/bash
# ==============================================================================
# Build Script for Vyx Fly Machine
# ==============================================================================
# Builds Docker image locally for testing
# Usage: ./scripts/build.sh [--no-cache]
# ==============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="vyx-fly-machine"
IMAGE_TAG="${IMAGE_TAG:-latest}"
DOCKERFILE="Dockerfile.prod"

echo -e "${BLUE}===================================================================${NC}"
echo -e "${BLUE}Building Vyx Fly Machine Docker Image${NC}"
echo -e "${BLUE}===================================================================${NC}"
echo ""

# Parse arguments
NO_CACHE=""
if [[ "$1" == "--no-cache" ]]; then
    NO_CACHE="--no-cache"
    echo -e "${YELLOW}Building with --no-cache flag${NC}"
fi

# Check if Dockerfile exists
if [ ! -f "$DOCKERFILE" ]; then
    echo -e "${RED}Error: $DOCKERFILE not found${NC}"
    exit 1
fi

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"

echo -e "${BLUE}Project directory: ${NC}$PROJECT_DIR"
echo -e "${BLUE}Dockerfile: ${NC}$DOCKERFILE"
echo -e "${BLUE}Image: ${NC}$IMAGE_NAME:$IMAGE_TAG"
echo ""

# Change to project directory
cd "$PROJECT_DIR"

# Build the image
echo -e "${YELLOW}Starting Docker build...${NC}"
docker build \
    $NO_CACHE \
    -f "$DOCKERFILE" \
    -t "$IMAGE_NAME:$IMAGE_TAG" \
    .

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}===================================================================${NC}"
    echo -e "${GREEN}✅ Build successful!${NC}"
    echo -e "${GREEN}===================================================================${NC}"
    echo ""
    echo -e "${BLUE}Image details:${NC}"
    docker images "$IMAGE_NAME:$IMAGE_TAG" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo -e "  1. Test locally:  ${GREEN}./scripts/test-local.sh${NC}"
    echo -e "  2. Deploy to Fly: ${GREEN}./scripts/deploy.sh${NC}"
    echo ""
else
    echo -e "${RED}===================================================================${NC}"
    echo -e "${RED}❌ Build failed!${NC}"
    echo -e "${RED}===================================================================${NC}"
    exit 1
fi
