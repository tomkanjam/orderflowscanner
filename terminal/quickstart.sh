#!/bin/bash

# AI Crypto Trader TUI - Quick Start Script
set -e

echo "🚀 AI Crypto Trader - Terminal UI Setup"
echo "========================================"
echo ""

# Check for Go installation
if ! command -v go &> /dev/null; then
    echo "❌ Go is not installed. Please install Go 1.21+ from https://go.dev/dl/"
    exit 1
fi

GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
echo "✓ Go $GO_VERSION detected"

# Check terminal capabilities
if [ -z "$TERM" ]; then
    echo "⚠️  TERM environment variable not set. Setting to xterm-256color..."
    export TERM=xterm-256color
fi

echo "✓ Terminal: $TERM"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
go mod download
echo "✓ Dependencies installed"
echo ""

# Build the binary
echo "🔨 Building aitrader..."
go build -ldflags="-s -w" -o aitrader ./cmd/aitrader
echo "✓ Build complete"
echo ""

# Check if binary was created
if [ ! -f "./aitrader" ]; then
    echo "❌ Build failed - aitrader binary not found"
    exit 1
fi

echo "✨ Setup complete!"
echo ""
echo "To run the application:"
echo "  ./aitrader"
echo ""
echo "Keyboard shortcuts:"
echo "  1-6       - Switch panels"
echo "  Tab       - Next panel"
echo "  ?         - Help"
echo "  q         - Quit"
echo ""

# Ask if user wants to run now
read -p "Run aitrader now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    ./aitrader
fi
