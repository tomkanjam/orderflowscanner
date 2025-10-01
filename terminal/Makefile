.PHONY: build run dev clean install test help

# Binary name
BINARY=aitrader
MAIN_PATH=./cmd/aitrader

# Build flags
LDFLAGS=-ldflags="-s -w"
VERSION=$(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME=$(shell date -u '+%Y-%m-%d_%H:%M:%S')

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

build: ## Build the binary
	@echo "Building $(BINARY)..."
	@go build $(LDFLAGS) -o $(BINARY) $(MAIN_PATH)
	@echo "✓ Built $(BINARY)"

run: ## Run the application
	@go run $(MAIN_PATH)

dev: ## Run with hot reload (requires air)
	@air || (echo "air not found. Install with: go install github.com/cosmtrek/air@latest" && exit 1)

install: ## Install the binary to $GOPATH/bin
	@echo "Installing $(BINARY) to $(GOPATH)/bin..."
	@go install $(LDFLAGS) $(MAIN_PATH)
	@echo "✓ Installed $(BINARY)"

clean: ## Clean build artifacts
	@echo "Cleaning..."
	@rm -f $(BINARY)
	@rm -rf dist/
	@echo "✓ Cleaned"

test: ## Run tests
	@go test -v ./...

deps: ## Download dependencies
	@echo "Downloading dependencies..."
	@go mod download
	@go mod tidy
	@echo "✓ Dependencies ready"

lint: ## Run linters
	@golangci-lint run || (echo "golangci-lint not found. Install from https://golangci-lint.run" && exit 1)

build-all: ## Build for all platforms
	@echo "Building for all platforms..."
	@mkdir -p dist
	@GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o dist/$(BINARY)-linux-amd64 $(MAIN_PATH)
	@GOOS=linux GOARCH=arm64 go build $(LDFLAGS) -o dist/$(BINARY)-linux-arm64 $(MAIN_PATH)
	@GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o dist/$(BINARY)-darwin-amd64 $(MAIN_PATH)
	@GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o dist/$(BINARY)-darwin-arm64 $(MAIN_PATH)
	@GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o dist/$(BINARY)-windows-amd64.exe $(MAIN_PATH)
	@echo "✓ Built all platforms in dist/"

release: clean build-all ## Create release builds
	@echo "Creating release archives..."
	@cd dist && for file in *; do \
		if [ -f "$$file" ]; then \
			tar czf "$$file.tar.gz" "$$file"; \
			rm "$$file"; \
		fi \
	done
	@echo "✓ Release archives created in dist/"

docker-build: ## Build Docker image
	@docker build -t aitrader-tui:latest .

docker-run: docker-build ## Run in Docker
	@docker run -it --rm aitrader-tui:latest

watch: ## Watch for changes and rebuild
	@while true; do \
		inotifywait -qre close_write .; \
		make build; \
	done

update: ## Update dependencies
	@go get -u ./...
	@go mod tidy

demo: ## Run with demo data (no backend required)
	@go run -tags demo $(MAIN_PATH)
