#!/bin/bash
# AI Crypto Trader - Cross-platform installer

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 AI Crypto Trader - Installer${NC}"
echo "=================================="
echo ""

# Detect OS
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
    Darwin*)
        PLATFORM="darwin"
        INSTALL_DIR="/usr/local/bin"
        ;;
    Linux*)
        PLATFORM="linux"
        INSTALL_DIR="/usr/local/bin"
        ;;
    MINGW*|MSYS*|CYGWIN*)
        PLATFORM="windows"
        INSTALL_DIR="$HOME/.local/bin"
        ;;
    *)
        echo -e "${RED}❌ Unsupported OS: $OS${NC}"
        exit 1
        ;;
esac

echo -e "${GREEN}✓${NC} Detected: $PLATFORM ($ARCH)"

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo -e "${RED}❌ Go is not installed${NC}"
    echo "Please install Go from https://go.dev/dl/"
    exit 1
fi

GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
echo -e "${GREEN}✓${NC} Go $GO_VERSION installed"
echo ""

# Build the binary
echo "🔨 Building aitrader..."
go build -ldflags="-s -w" -o aitrader ./cmd/aitrader

if [ ! -f "./aitrader" ]; then
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Build successful"
echo ""

# Install
echo "📦 Installing to $INSTALL_DIR..."

# Create install directory if it doesn't exist
mkdir -p "$INSTALL_DIR"

# Check if we need sudo
if [ -w "$INSTALL_DIR" ]; then
    cp aitrader "$INSTALL_DIR/"
else
    echo "Need sudo privileges to install to $INSTALL_DIR"
    sudo cp aitrader "$INSTALL_DIR/"
fi

# Make executable
if [ -w "$INSTALL_DIR/aitrader" ]; then
    chmod +x "$INSTALL_DIR/aitrader"
else
    sudo chmod +x "$INSTALL_DIR/aitrader"
fi

echo -e "${GREEN}✓${NC} Installed successfully!"
echo ""

# Add to PATH for Windows
if [ "$PLATFORM" = "windows" ]; then
    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        echo "export PATH=\"\$PATH:$INSTALL_DIR\"" >> ~/.bashrc
        echo -e "${BLUE}ℹ${NC} Added $INSTALL_DIR to PATH in ~/.bashrc"
        echo "   Run: source ~/.bashrc"
    fi
fi

# Verify installation
if command -v aitrader &> /dev/null; then
    echo -e "${GREEN}🎉 Installation complete!${NC}"
    echo ""
    echo "Run aitrader from anywhere:"
    echo "  ${BLUE}aitrader${NC}"
    echo ""
    echo "Keyboard shortcuts:"
    echo "  1-6  : Switch panels"
    echo "  Tab  : Next panel"
    echo "  ?    : Help"
    echo "  q    : Quit"
else
    echo -e "${RED}⚠${NC} Installation may not be complete"
    echo "Try running: source ~/.bashrc (or restart terminal)"
fi

echo ""
echo "Documentation: terminal/README.md"
echo "Report issues: https://github.com/yourusername/aitrader-tui/issues"
