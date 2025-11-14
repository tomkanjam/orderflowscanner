package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"github.com/vyx/go-screener/internal/server"
	"github.com/vyx/go-screener/pkg/config"
)

func main() {
	// Load .env file if it exists
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found or error loading it, using environment variables")
	}

	// Determine run mode
	runMode := os.Getenv("RUN_MODE")
	if runMode == "" {
		runMode = "shared_backend" // Default to shared mode
	}

	log.Printf("========================================")
	log.Printf("Starting server in %s mode", runMode)
	log.Printf("========================================")

	if runMode == "user_dedicated" {
		userID := os.Getenv("USER_ID")
		if userID == "" {
			log.Fatal("USER_ID required for user_dedicated mode")
		}
		log.Printf("Running dedicated instance for user: %s", userID)
	} else {
		log.Printf("Running shared backend (built-in traders only)")
	}

	// Debug: Log all environment variables
	log.Println("==== Environment Variables ====")
	for _, env := range os.Environ() {
		// Don't log full secrets, just show they exist
		if len(env) > 30 {
			log.Printf("%s...\n", env[:30])
		} else {
			log.Println(env)
		}
	}
	log.Println("==============================")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v\n", err)
	}

	// Create server
	srv, err := server.New(cfg)
	if err != nil {
		log.Fatalf("Failed to create server: %v\n", err)
	}

	// Start server in a goroutine
	go func() {
		if err := srv.Start(); err != nil {
			log.Fatalf("Server error: %v\n", err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	// Give it 15 seconds to shutdown gracefully
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v\n", err)
	}

	log.Println("Server exited")
}
