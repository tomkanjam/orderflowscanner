#!/bin/bash
# ==============================================================================
# Local Test Script for Vyx Fly Machine
# ==============================================================================
# Runs the Docker container locally with environment variables
# Usage: ./scripts/test-local.sh
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
CONTAINER_NAME="vyx-fly-machine-test"

echo -e "${BLUE}===================================================================${NC}"
echo -e "${BLUE}Testing Vyx Fly Machine Locally${NC}"
echo -e "${BLUE}===================================================================${NC}"
echo ""

# Check if image exists
if ! docker images "$IMAGE_NAME:$IMAGE_TAG" --format "{{.Repository}}" | grep -q "$IMAGE_NAME"; then
    echo -e "${RED}Error: Image $IMAGE_NAME:$IMAGE_TAG not found${NC}"
    echo -e "${YELLOW}Run: ./scripts/build.sh${NC}"
    exit 1
fi

# Stop and remove existing container if running
if docker ps -a --format "{{.Names}}" | grep -q "$CONTAINER_NAME"; then
    echo -e "${YELLOW}Stopping existing container...${NC}"
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    docker rm "$CONTAINER_NAME" 2>/dev/null || true
fi

# Load environment variables from .env.local if it exists
ENV_FILE="../../../.env.local"
if [ -f "$ENV_FILE" ]; then
    echo -e "${GREEN}Loading environment from .env.local${NC}"
    export $(grep -v '^#' "$ENV_FILE" | xargs)
else
    echo -e "${YELLOW}Warning: .env.local not found, using minimal config${NC}"
fi

# Required environment variables
USER_ID="${USER_ID:-test-user-id}"
MACHINE_ID="${MACHINE_ID:-test-machine-$(date +%s)}"
SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_KEY:-}"

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_KEY" ]; then
    echo -e "${RED}Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set${NC}"
    echo -e "${YELLOW}Either:${NC}"
    echo -e "  1. Create .env.local with required variables"
    echo -e "  2. Export them manually:"
    echo -e "     ${GREEN}export SUPABASE_URL=...${NC}"
    echo -e "     ${GREEN}export SUPABASE_SERVICE_KEY=...${NC}"
    exit 1
fi

echo -e "${BLUE}Configuration:${NC}"
echo -e "  User ID:    $USER_ID"
echo -e "  Machine ID: $MACHINE_ID"
echo -e "  Supabase:   ${SUPABASE_URL}"
echo ""

# Run container
echo -e "${YELLOW}Starting container...${NC}"
docker run -d \
    --name "$CONTAINER_NAME" \
    -p 8080:8080 \
    -p 8081:8081 \
    -e USER_ID="$USER_ID" \
    -e MACHINE_ID="$MACHINE_ID" \
    -e MACHINE_REGION="sjc" \
    -e MACHINE_CPUS="2" \
    -e MACHINE_MEMORY="512" \
    -e SUPABASE_URL="$SUPABASE_URL" \
    -e SUPABASE_SERVICE_KEY="$SUPABASE_SERVICE_KEY" \
    -e GEMINI_API_KEY="${GEMINI_API_KEY:-}" \
    -e KLINE_INTERVAL="5m" \
    -e SCREENING_INTERVAL_MS="60000" \
    "$IMAGE_NAME:$IMAGE_TAG"

# Wait for container to start
echo -e "${YELLOW}Waiting for container to start...${NC}"
sleep 5

# Check if container is running
if ! docker ps --format "{{.Names}}" | grep -q "$CONTAINER_NAME"; then
    echo -e "${RED}Container failed to start!${NC}"
    echo -e "${YELLOW}Logs:${NC}"
    docker logs "$CONTAINER_NAME"
    exit 1
fi

echo ""
echo -e "${GREEN}===================================================================${NC}"
echo -e "${GREEN}✅ Container started successfully!${NC}"
echo -e "${GREEN}===================================================================${NC}"
echo ""

# Show container status
docker ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo -e "${YELLOW}Health check:${NC}"
sleep 2
curl -f http://localhost:8080/health && echo -e " ${GREEN}✓${NC}" || echo -e " ${RED}✗${NC}"

echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo -e "  View logs:     ${GREEN}docker logs -f $CONTAINER_NAME${NC}"
echo -e "  Stop container:${GREEN}docker stop $CONTAINER_NAME${NC}"
echo -e "  Remove:        ${GREEN}docker rm $CONTAINER_NAME${NC}"
echo -e "  Health check:  ${GREEN}curl http://localhost:8080/health${NC}"
echo -e "  Exec shell:    ${GREEN}docker exec -it $CONTAINER_NAME sh${NC}"
echo ""
echo -e "${BLUE}Streaming logs (Ctrl+C to stop):${NC}"
docker logs -f "$CONTAINER_NAME"
