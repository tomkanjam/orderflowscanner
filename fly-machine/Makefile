.PHONY: build run test docker-build docker-run clean tidy

build:
	go build -o trader-machine ./cmd/machine

run:
	go run ./cmd/machine

test:
	go test -v ./...

docker-build:
	docker build -t trader-machine:latest .

docker-run:
	docker run --env-file .env -p 8080:8080 trader-machine:latest

clean:
	rm -f trader-machine

tidy:
	go mod tidy

fmt:
	go fmt ./...

lint:
	golangci-lint run

generate-stubs:
	@echo "Generating remaining implementation stubs..."
	@./scripts/generate-stubs.sh
