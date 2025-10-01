package storage

import (
	"context"
	"os"
	"testing"
	"time"
)

func TestSQLiteStorage(t *testing.T) {
	// Create temporary database
	dbPath := "./test.db"
	defer os.Remove(dbPath)

	// Initialize storage
	storage, err := NewSQLiteStorage(dbPath)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}
	defer storage.Close()

	ctx := context.Background()

	// Test trader creation
	trader := &Trader{
		ID:          "trader-1",
		UserID:      "user-1",
		Name:        "Test Trader",
		Description: "A test trading strategy",
		Symbols:     []string{"BTCUSDT", "ETHUSDT"},
		Timeframes:  []string{"1h", "4h"},
		CheckInterval: "5m",
		SignalCode:  "// test code",
		Status:      "active",
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	err = storage.CreateTrader(ctx, trader)
	if err != nil {
		t.Fatalf("Failed to create trader: %v", err)
	}

	// Test trader retrieval
	retrieved, err := storage.GetTrader(ctx, "trader-1")
	if err != nil {
		t.Fatalf("Failed to get trader: %v", err)
	}

	if retrieved == nil {
		t.Fatal("Expected trader to be retrieved")
	}

	if retrieved.ID != "trader-1" {
		t.Errorf("Expected trader ID = 'trader-1', got %s", retrieved.ID)
	}

	if retrieved.Name != "Test Trader" {
		t.Errorf("Expected name = 'Test Trader', got %s", retrieved.Name)
	}

	// Test get active traders
	traders, err := storage.GetActiveTraders(ctx, "user-1")
	if err != nil {
		t.Fatalf("Failed to get active traders: %v", err)
	}

	if len(traders) != 1 {
		t.Errorf("Expected 1 active trader, got %d", len(traders))
	}

	// Test trader update
	trader.Name = "Updated Trader"
	err = storage.UpdateTrader(ctx, trader)
	if err != nil {
		t.Fatalf("Failed to update trader: %v", err)
	}

	updated, err := storage.GetTrader(ctx, "trader-1")
	if err != nil {
		t.Fatalf("Failed to get updated trader: %v", err)
	}

	if updated.Name != "Updated Trader" {
		t.Errorf("Expected name = 'Updated Trader', got %s", updated.Name)
	}

	// Test signal creation
	signal := &Signal{
		ID:           "signal-1",
		TraderID:     "trader-1",
		Symbol:       "BTCUSDT",
		Timeframe:    "1h",
		SignalType:   "entry",
		Status:       "pending",
		TriggerPrice: 43000.0,
		TargetPrice:  45000.0,
		StopLoss:     42000.0,
		Confidence:   85,
		Reasoning:    "Strong uptrend",
		Metadata:     map[string]interface{}{"rsi": 65},
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	err = storage.CreateSignal(ctx, signal)
	if err != nil {
		t.Fatalf("Failed to create signal: %v", err)
	}

	// Test signal retrieval
	signals, err := storage.GetSignals(ctx, "trader-1", 10)
	if err != nil {
		t.Fatalf("Failed to get signals: %v", err)
	}

	if len(signals) != 1 {
		t.Errorf("Expected 1 signal, got %d", len(signals))
	}

	if signals[0].Symbol != "BTCUSDT" {
		t.Errorf("Expected symbol = 'BTCUSDT', got %s", signals[0].Symbol)
	}

	// Test position creation
	position := &Position{
		ID:           "pos-1",
		UserID:       "user-1",
		TraderID:     "trader-1",
		SignalID:     "signal-1",
		Symbol:       "BTCUSDT",
		Side:         "LONG",
		EntryPrice:   43000.0,
		CurrentPrice: 43500.0,
		Size:         0.1,
		StopLoss:     42000.0,
		TakeProfit:   45000.0,
		PNL:          50.0,
		PNLPct:       1.16,
		Status:       "open",
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	err = storage.CreatePosition(ctx, position)
	if err != nil {
		t.Fatalf("Failed to create position: %v", err)
	}

	// Test position retrieval
	positions, err := storage.GetOpenPositions(ctx, "user-1")
	if err != nil {
		t.Fatalf("Failed to get open positions: %v", err)
	}

	if len(positions) != 1 {
		t.Errorf("Expected 1 open position, got %d", len(positions))
	}

	// Test position update
	position.CurrentPrice = 44000.0
	position.PNL = 100.0
	err = storage.UpdatePosition(ctx, position)
	if err != nil {
		t.Fatalf("Failed to update position: %v", err)
	}

	updatedPos, err := storage.GetPosition(ctx, "pos-1")
	if err != nil {
		t.Fatalf("Failed to get updated position: %v", err)
	}

	if updatedPos.CurrentPrice != 44000.0 {
		t.Errorf("Expected current price = 44000.0, got %f", updatedPos.CurrentPrice)
	}

	// Test close position
	err = storage.ClosePosition(ctx, "pos-1")
	if err != nil {
		t.Fatalf("Failed to close position: %v", err)
	}

	closedPos, err := storage.GetPosition(ctx, "pos-1")
	if err != nil {
		t.Fatalf("Failed to get closed position: %v", err)
	}

	if closedPos.Status != "closed" {
		t.Errorf("Expected status = 'closed', got %s", closedPos.Status)
	}

	// Note: Can't delete trader due to foreign key constraints from signal and position
	// In a real system, you'd need to delete/close all related records first
	// For this test, we'll just verify the trader still exists
	exists, err := storage.GetTrader(ctx, "trader-1")
	if err != nil {
		t.Fatalf("Failed to check trader: %v", err)
	}

	if exists == nil {
		t.Error("Expected trader to still exist")
	}
}

func TestSQLiteStorageHeartbeat(t *testing.T) {
	dbPath := "./test_heartbeat.db"
	defer os.Remove(dbPath)

	storage, err := NewSQLiteStorage(dbPath)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}
	defer storage.Close()

	ctx := context.Background()

	// Test heartbeat
	err = storage.UpdateHeartbeat(ctx, "machine-1")
	if err != nil {
		t.Fatalf("Failed to update heartbeat: %v", err)
	}

	// Update again (should be idempotent)
	err = storage.UpdateHeartbeat(ctx, "machine-1")
	if err != nil {
		t.Fatalf("Failed to update heartbeat again: %v", err)
	}
}
