/**
 * Integration tests for AI Analysis Edge Function
 * Tests the full flow: Fly Machine → Edge Function → Database
 *
 * Prerequisites:
 * - Supabase project running (local or remote)
 * - Edge Function deployed and accessible
 * - GEMINI_API_KEY configured
 * - Test database with signal_analyses table
 *
 * Run with: pnpm test
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Test configuration
const TEST_CONFIG = {
  supabaseUrl: process.env.SUPABASE_URL || 'http://localhost:54321',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || 'test-service-key',
  edgeFunctionUrl: process.env.EDGE_FUNCTION_URL || 'http://localhost:54321/functions/v1/ai-analysis',
  skipIntegrationTests: process.env.SKIP_INTEGRATION_TESTS === 'true'
};

// Mock Kline data for testing
function createMockKlines(count: number = 100) {
  const klines = [];
  const basePrice = 50000;
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const price = basePrice + (Math.random() - 0.5) * 1000;
    klines.push([
      now + i * 60000,
      price.toString(),
      (price + 100).toString(),
      (price - 100).toString(),
      price.toString(),
      '1000',
      now + i * 60000 + 60000,
      '0',
      0,
      '0',
      '0',
      '0'
    ]);
  }

  return klines;
}

// Mock calculated indicators
const mockIndicators = {
  sma_20: 50000,
  sma_50: 49800,
  rsi_14: 55.5,
  atr_14: 500,
  macd: {
    macd: 120,
    signal: 100,
    histogram: 20
  }
};

describe('AI Analysis Integration Tests', () => {
  let supabase: SupabaseClient;

  beforeAll(() => {
    if (TEST_CONFIG.skipIntegrationTests) {
      console.log('⏭️  Skipping integration tests (SKIP_INTEGRATION_TESTS=true)');
      return;
    }

    // Initialize Supabase client
    supabase = createClient(
      TEST_CONFIG.supabaseUrl,
      TEST_CONFIG.supabaseServiceKey
    );

    console.log('🧪 Running integration tests against:', TEST_CONFIG.supabaseUrl);
  });

  afterAll(async () => {
    if (!TEST_CONFIG.skipIntegrationTests && supabase) {
      // Clean up test data
      const { error } = await supabase
        .from('signal_analyses')
        .delete()
        .ilike('signal_id', 'test-%');

      if (error) {
        console.warn('⚠️  Failed to clean up test data:', error.message);
      }
    }
  });

  describe('Full Flow: Fly → Edge Function → Database', () => {
    it('should call Edge Function and receive valid analysis', async () => {
      if (TEST_CONFIG.skipIntegrationTests) return;

      const testRequest = {
        signalId: `test-signal-${Date.now()}`,
        traderId: 'test-trader-123',
        userId: 'test-user-456',
        symbol: 'BTCUSDT',
        price: 50000,
        klines: createMockKlines(100),
        strategy: 'Test strategy: Buy when RSI < 30 and price above SMA 50',
        calculatedIndicators: mockIndicators,
        priority: 'normal' as const,
        correlationId: `test-corr-${Date.now()}`
      };

      // Call Edge Function
      const response = await fetch(TEST_CONFIG.edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_CONFIG.supabaseServiceKey}`
        },
        body: JSON.stringify(testRequest)
      });

      expect(response.ok).toBe(true);

      const result = await response.json();

      // Verify response structure
      expect(result).toHaveProperty('signalId');
      expect(result).toHaveProperty('traderId');
      expect(result).toHaveProperty('userId');
      expect(result).toHaveProperty('decision');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('reasoning');
      expect(result).toHaveProperty('keyLevels');
      expect(result).toHaveProperty('tradePlan');
      expect(result).toHaveProperty('metadata');

      // Verify decision is valid enum
      expect(['enter_trade', 'bad_setup', 'wait']).toContain(result.decision);

      // Verify confidence is in range
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);

      // Verify key levels structure
      expect(result.keyLevels).toHaveProperty('entry');
      expect(result.keyLevels).toHaveProperty('stopLoss');
      expect(result.keyLevels).toHaveProperty('takeProfit');
      expect(result.keyLevels.takeProfit).toBeInstanceOf(Array);

      // Verify metadata
      expect(result.metadata).toHaveProperty('analysisLatencyMs');
      expect(result.metadata).toHaveProperty('geminiTokensUsed');
      expect(result.metadata).toHaveProperty('modelName');

      console.log('✅ Edge Function returned valid analysis');
      console.log(`   Decision: ${result.decision} (${result.confidence}% confidence)`);
      console.log(`   Latency: ${result.metadata.analysisLatencyMs}ms`);
      console.log(`   Tokens: ${result.metadata.geminiTokensUsed}`);
    }, 60000); // 60 second timeout

    it('should write analysis to database', async () => {
      if (TEST_CONFIG.skipIntegrationTests) return;

      const testSignalId = `test-signal-db-${Date.now()}`;
      const testRequest = {
        signalId: testSignalId,
        traderId: 'test-trader-db',
        userId: 'test-user-db',
        symbol: 'ETHUSDT',
        price: 3000,
        klines: createMockKlines(100),
        strategy: 'Test database write',
        calculatedIndicators: mockIndicators,
        priority: 'normal' as const,
        correlationId: `test-corr-db-${Date.now()}`
      };

      // Call Edge Function
      const response = await fetch(TEST_CONFIG.edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_CONFIG.supabaseServiceKey}`
        },
        body: JSON.stringify(testRequest)
      });

      expect(response.ok).toBe(true);

      // Wait a bit for database write
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Query database for the analysis
      const { data, error } = await supabase
        .from('signal_analyses')
        .select('*')
        .eq('signal_id', testSignalId)
        .single();

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.signal_id).toBe(testSignalId);
      expect(data?.trader_id).toBe('test-trader-db');
      expect(data?.user_id).toBe('test-user-db');
      expect(data?.decision).toBeDefined();
      expect(data?.confidence).toBeGreaterThanOrEqual(0);

      console.log('✅ Analysis written to database successfully');
      console.log(`   Record ID: ${data?.id}`);
    }, 60000);

    it('should handle analysis with minimal indicators', async () => {
      if (TEST_CONFIG.skipIntegrationTests) return;

      const testRequest = {
        signalId: `test-signal-minimal-${Date.now()}`,
        traderId: 'test-trader-minimal',
        userId: 'test-user-minimal',
        symbol: 'BNBUSDT',
        price: 300,
        klines: createMockKlines(50), // Fewer klines
        strategy: 'Simple breakout strategy',
        calculatedIndicators: { atr_14: 10 }, // Minimal indicators
        priority: 'low' as const,
        correlationId: `test-corr-minimal-${Date.now()}`
      };

      const response = await fetch(TEST_CONFIG.edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_CONFIG.supabaseServiceKey}`
        },
        body: JSON.stringify(testRequest)
      });

      expect(response.ok).toBe(true);

      const result = await response.json();
      expect(result.decision).toBeDefined();
      expect(result.keyLevels.entry).toBe(300);

      console.log('✅ Handled minimal indicators case');
    }, 60000);
  });

  describe('Error Recovery', () => {
    it('should handle missing authentication', async () => {
      if (TEST_CONFIG.skipIntegrationTests) return;

      const testRequest = {
        signalId: 'test-auth-fail',
        traderId: 'test-trader',
        userId: 'test-user',
        symbol: 'BTCUSDT',
        price: 50000,
        klines: createMockKlines(10),
        strategy: 'Test auth',
        calculatedIndicators: {},
        priority: 'normal' as const,
        correlationId: 'test-auth-corr'
      };

      // Call without Authorization header
      const response = await fetch(TEST_CONFIG.edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testRequest)
      });

      expect(response.status).toBe(401);
      console.log('✅ Correctly rejected request without auth');
    });

    it('should handle malformed request body', async () => {
      if (TEST_CONFIG.skipIntegrationTests) return;

      const response = await fetch(TEST_CONFIG.edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_CONFIG.supabaseServiceKey}`
        },
        body: JSON.stringify({ invalid: 'data' })
      });

      // Should return error response but not crash
      expect(response.status).toBeGreaterThanOrEqual(400);
      console.log('✅ Handled malformed request gracefully');
    });

    it('should return safe default on Gemini error', async () => {
      if (TEST_CONFIG.skipIntegrationTests) return;

      // This test assumes Gemini might fail occasionally
      // We're just verifying the Edge Function doesn't crash
      const testRequest = {
        signalId: `test-signal-error-${Date.now()}`,
        traderId: 'test-trader-error',
        userId: 'test-user-error',
        symbol: 'BTCUSDT',
        price: 50000,
        klines: createMockKlines(5), // Very few klines might cause issues
        strategy: 'Test error handling with minimal data',
        calculatedIndicators: {},
        priority: 'normal' as const,
        correlationId: `test-corr-error-${Date.now()}`
      };

      const response = await fetch(TEST_CONFIG.edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_CONFIG.supabaseServiceKey}`
        },
        body: JSON.stringify(testRequest)
      });

      // Should always return a response, even if it's an error
      expect(response).toBeDefined();

      const result = await response.json();

      // Should have a decision, even if it's "bad_setup" due to errors
      expect(result).toHaveProperty('decision');

      console.log('✅ Edge Function returned response despite potential errors');
      console.log(`   Decision: ${result.decision}`);
    }, 60000);
  });

  describe('Rate Limiting and Concurrency', () => {
    it('should handle multiple concurrent requests', async () => {
      if (TEST_CONFIG.skipIntegrationTests) return;

      const requests = Array.from({ length: 5 }, (_, i) => ({
        signalId: `test-signal-concurrent-${Date.now()}-${i}`,
        traderId: `test-trader-${i}`,
        userId: 'test-user-concurrent',
        symbol: 'BTCUSDT',
        price: 50000 + i * 100,
        klines: createMockKlines(20),
        strategy: `Concurrent test ${i}`,
        calculatedIndicators: mockIndicators,
        priority: 'normal' as const,
        correlationId: `test-corr-concurrent-${Date.now()}-${i}`
      }));

      const startTime = Date.now();

      // Send all requests concurrently
      const responses = await Promise.all(
        requests.map(req =>
          fetch(TEST_CONFIG.edgeFunctionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${TEST_CONFIG.supabaseServiceKey}`
            },
            body: JSON.stringify(req)
          })
        )
      );

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All should succeed
      const allSucceeded = responses.every(r => r.ok);
      expect(allSucceeded).toBe(true);

      // Parse results
      const results = await Promise.all(responses.map(r => r.json()));

      // All should have valid decisions
      results.forEach(result => {
        expect(['enter_trade', 'bad_setup', 'wait']).toContain(result.decision);
      });

      console.log('✅ Handled 5 concurrent requests successfully');
      console.log(`   Total time: ${totalTime}ms`);
      console.log(`   Average per request: ${Math.round(totalTime / 5)}ms`);
    }, 120000); // 2 minute timeout for concurrent tests
  });

  describe('Health Check', () => {
    it('should respond to health check endpoint', async () => {
      if (TEST_CONFIG.skipIntegrationTests) return;

      const healthUrl = TEST_CONFIG.edgeFunctionUrl.replace(/\/$/, '') + '/health';

      const response = await fetch(healthUrl, {
        method: 'GET'
      });

      expect(response.ok).toBe(true);

      const result = await response.json();
      expect(result).toHaveProperty('status');
      expect(result.status).toBe('healthy');

      console.log('✅ Health check endpoint responding');
    });
  });
});
