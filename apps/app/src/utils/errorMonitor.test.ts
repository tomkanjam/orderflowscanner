import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { errorMonitor, ErrorCategory, ErrorSeverity, type ErrorEvent, type MemoryMetrics } from './errorMonitor';

describe('ErrorMonitor', () => {
  beforeEach(() => {
    // Clear history before each test
    errorMonitor.clearHistory();
    // Reset any mocked timers
    vi.clearAllTimers();
  });

  afterEach(() => {
    // Clean up after each test
    errorMonitor.cleanup();
  });

  describe('Memory Management', () => {
    test('memory stays bounded under burst load', () => {
      // Track 10,000 errors
      for (let i = 0; i < 10000; i++) {
        errorMonitor.trackError(
          ErrorCategory.NETWORK,
          `error-${i}`,
          undefined,
          { index: i }
        );
      }

      const stats = errorMonitor.getStats();

      // Should only keep maxHistorySize (100) errors
      expect(stats.recentErrors.length).toBeLessThanOrEqual(10);
      expect(stats.totalErrors).toBe(100); // Max history size

      // Check memory metrics
      const memory = stats.memory;
      expect(memory).toBeDefined();
      expect(memory!.errorHistorySize).toBe(100);
    });

    test('circular buffer evicts oldest entries', () => {
      // Add 150 errors (more than the 100 capacity)
      for (let i = 0; i < 150; i++) {
        errorMonitor.trackError(
          ErrorCategory.NETWORK,
          `error-${i}`
        );
      }

      const stats = errorMonitor.getStats();
      const allErrors = stats.recentErrors;

      // Should not contain the first 50 errors (they were evicted)
      const messages = allErrors.map(e => e.message);
      expect(messages).not.toContain('error-0');
      expect(messages).not.toContain('error-49');

      // Should contain the most recent errors
      // Note: recentErrors only shows last 10, but they should be from the recent batch
      expect(stats.totalErrors).toBe(100);
    });

    test('memory metrics are accurate', () => {
      // Add some errors
      for (let i = 0; i < 50; i++) {
        errorMonitor.trackError(ErrorCategory.NETWORK, `error-${i}`);
      }

      const memory = errorMonitor.getMemoryMetrics();

      expect(memory.errorHistorySize).toBe(50);
      expect(memory.errorMapSize).toBeGreaterThan(0);
      expect(memory.totalMemoryMB).toBeGreaterThan(0);
      expect(memory.totalMemoryMB).toBeLessThan(10); // Should be well under 10MB
      expect(memory.lastMeasured).toBeGreaterThan(0);
    });
  });

  describe('Deduplication', () => {
    test('deduplicates identical errors within 5 second window', async () => {
      // Track the same error multiple times quickly
      errorMonitor.trackError(ErrorCategory.NETWORK, 'timeout');
      errorMonitor.trackError(ErrorCategory.NETWORK, 'timeout');
      errorMonitor.trackError(ErrorCategory.NETWORK, 'timeout');

      const stats = errorMonitor.getStats();

      // Should only have one entry in history due to deduplication
      const timeoutErrors = stats.recentErrors.filter(e => e.message === 'timeout');
      expect(timeoutErrors.length).toBe(1);

      // But the count should reflect all occurrences
      expect(timeoutErrors[0].count).toBeGreaterThanOrEqual(1);
    });

    test('does not deduplicate after 5 second window', async () => {
      // Use fake timers for this test
      vi.useFakeTimers();

      errorMonitor.trackError(ErrorCategory.NETWORK, 'timeout');

      // Advance time by 6 seconds
      vi.advanceTimersByTime(6000);

      errorMonitor.trackError(ErrorCategory.NETWORK, 'timeout');

      const stats = errorMonitor.getStats();
      const timeoutErrors = stats.recentErrors.filter(e => e.message === 'timeout');

      // Should have two entries since they're outside the dedup window
      expect(timeoutErrors.length).toBe(2);

      vi.useRealTimers();
    });

    test('dedup statistics are tracked correctly', () => {
      // Track some duplicate errors
      for (let i = 0; i < 10; i++) {
        errorMonitor.trackError(ErrorCategory.NETWORK, 'duplicate-error');
      }

      // Track some unique errors
      for (let i = 0; i < 5; i++) {
        errorMonitor.trackError(ErrorCategory.NETWORK, `unique-error-${i}`);
      }

      const memory = errorMonitor.getMemoryMetrics();

      // Should have saved 9 duplicates (first one is stored, rest are deduped)
      expect(memory.dedupStats.saved).toBeGreaterThanOrEqual(9);
      expect(memory.dedupStats.total).toBe(15);
      expect(memory.dedupStats.percentage).toBeGreaterThan(50);
    });

    test('different error categories are not deduplicated together', () => {
      errorMonitor.trackError(ErrorCategory.NETWORK, 'error');
      errorMonitor.trackError(ErrorCategory.CACHE, 'error');
      errorMonitor.trackError(ErrorCategory.WEBSOCKET, 'error');

      const stats = errorMonitor.getStats();

      // Should have 3 separate entries despite same message
      const errors = stats.recentErrors.filter(e => e.message === 'error');
      expect(errors.length).toBe(3);
      expect(errors.map(e => e.category)).toContain(ErrorCategory.NETWORK);
      expect(errors.map(e => e.category)).toContain(ErrorCategory.CACHE);
      expect(errors.map(e => e.category)).toContain(ErrorCategory.WEBSOCKET);
    });
  });

  describe('Backward Compatibility', () => {
    test('all public methods still exist and work', () => {
      // Test trackError
      expect(() => {
        errorMonitor.trackError(ErrorCategory.NETWORK, 'test');
      }).not.toThrow();

      // Test trackNetworkError
      expect(() => {
        errorMonitor.trackNetworkError('http://example.com', 404, 'Not found');
      }).not.toThrow();

      // Test trackRealtimeError
      expect(() => {
        errorMonitor.trackRealtimeError('channel1', 'Connection lost');
      }).not.toThrow();

      // Test trackDataFetchError
      expect(() => {
        errorMonitor.trackDataFetchError('BTCUSDT', '1h', new Error('Fetch failed'));
      }).not.toThrow();

      // Test getStats
      const stats = errorMonitor.getStats();
      expect(stats).toHaveProperty('totalErrors');
      expect(stats).toHaveProperty('errorsByCategory');
      expect(stats).toHaveProperty('errorsBySeverity');
      expect(stats).toHaveProperty('recentErrors');
      expect(stats).toHaveProperty('criticalAlerts');
      expect(stats).toHaveProperty('errorRate');

      // Test clearHistory
      expect(() => {
        errorMonitor.clearHistory();
      }).not.toThrow();

      // Test subscribe
      const unsubscribe = errorMonitor.subscribe((event) => {
        expect(event).toHaveProperty('category');
        expect(event).toHaveProperty('severity');
        expect(event).toHaveProperty('message');
      });
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();

      // Test setAlertThreshold
      expect(() => {
        errorMonitor.setAlertThreshold(ErrorCategory.NETWORK, 20, ErrorSeverity.HIGH);
      }).not.toThrow();

      // Test shouldRecover
      const shouldRecover = errorMonitor.shouldRecover(ErrorCategory.NETWORK);
      expect(typeof shouldRecover).toBe('boolean');

      // Test cleanup
      expect(() => {
        errorMonitor.cleanup();
      }).not.toThrow();
    });

    test('error event structure remains unchanged', () => {
      errorMonitor.trackError(
        ErrorCategory.NETWORK,
        'Test error',
        new Error('Original error'),
        { custom: 'metadata' }
      );

      const stats = errorMonitor.getStats();
      const event = stats.recentErrors[0];

      // Verify ErrorEvent interface
      expect(event).toHaveProperty('category');
      expect(event).toHaveProperty('severity');
      expect(event).toHaveProperty('message');
      expect(event).toHaveProperty('timestamp');
      expect(event).toHaveProperty('count');

      // Optional properties may or may not exist
      expect(event.category).toBe(ErrorCategory.NETWORK);
      expect(event.message).toBe('Test error');
      expect(typeof event.timestamp).toBe('number');
      expect(typeof event.count).toBe('number');
    });

    test('callbacks are still notified correctly', () => {
      const callback = vi.fn();
      const unsubscribe = errorMonitor.subscribe(callback);

      errorMonitor.trackError(ErrorCategory.NETWORK, 'Test error');

      expect(callback).toHaveBeenCalled();
      const event = callback.mock.calls[0][0];
      expect(event.category).toBe(ErrorCategory.NETWORK);
      expect(event.message).toBe('Test error');

      unsubscribe();
    });

    test('alert thresholds still work', () => {
      const callback = vi.fn();
      errorMonitor.subscribe(callback);

      // Set a low threshold
      errorMonitor.setAlertThreshold(ErrorCategory.NETWORK, 5, ErrorSeverity.HIGH);

      // Trigger many errors quickly
      for (let i = 0; i < 10; i++) {
        errorMonitor.trackError(ErrorCategory.NETWORK, `error-${i}`);
      }

      // Should have triggered threshold alerts
      const calls = callback.mock.calls;
      const alertCalls = calls.filter(([event]) =>
        event.message.includes('Alert:') ||
        event.message.includes('error rate exceeded')
      );

      expect(alertCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Data Sanitization', () => {
    test('sanitizes long error messages', () => {
      const longMessage = 'x'.repeat(1000);
      errorMonitor.trackError(ErrorCategory.NETWORK, longMessage);

      const stats = errorMonitor.getStats();
      const event = stats.recentErrors[0];

      // Message should be truncated to 500 chars + '...'
      expect(event.message.length).toBe(503);
      expect(event.message.endsWith('...')).toBe(true);
    });

    test('removes sensitive data from metadata', () => {
      errorMonitor.trackError(
        ErrorCategory.NETWORK,
        'API error',
        undefined,
        {
          apiKey: 'secret-key',
          password: 'secret-pass',
          token: 'secret-token',
          secretData: 'sensitive',
          normalData: 'visible',
          userApiKey: 'also-removed'
        }
      );

      const stats = errorMonitor.getStats();
      const event = stats.recentErrors[0];

      // Sensitive keys should be removed
      expect(event.metadata).toBeDefined();
      expect(event.metadata).not.toHaveProperty('apiKey');
      expect(event.metadata).not.toHaveProperty('password');
      expect(event.metadata).not.toHaveProperty('token');
      expect(event.metadata).not.toHaveProperty('secretData');
      expect(event.metadata).not.toHaveProperty('userApiKey');

      // Normal data should remain
      expect(event.metadata).toHaveProperty('normalData');
      expect(event.metadata!.normalData).toBe('visible');
    });
  });

  describe('Performance', () => {
    test('handles rapid error tracking efficiently', () => {
      const start = performance.now();

      // Track 1000 errors as fast as possible
      for (let i = 0; i < 1000; i++) {
        errorMonitor.trackError(
          ErrorCategory.NETWORK,
          Math.random() > 0.7 ? 'common-error' : `unique-${i}`
        );
      }

      const duration = performance.now() - start;

      // Should complete within reasonable time (less than 100ms)
      expect(duration).toBeLessThan(100);

      // Verify data integrity
      const stats = errorMonitor.getStats();
      expect(stats.totalErrors).toBe(100); // Capped at max
    });

    test('memory remains stable over time', () => {
      // Simulate long-running session with periodic errors
      const iterations = 100;
      const memoryReadings: number[] = [];

      for (let i = 0; i < iterations; i++) {
        // Add some errors
        for (let j = 0; j < 10; j++) {
          errorMonitor.trackError(
            ErrorCategory.NETWORK,
            Math.random() > 0.5 ? `error-${i}` : 'common-error'
          );
        }

        // Check memory every 10 iterations
        if (i % 10 === 0) {
          const memory = errorMonitor.getMemoryMetrics();
          memoryReadings.push(memory.totalMemoryMB);
        }
      }

      // Memory should stabilize and not grow unbounded
      const firstReading = memoryReadings[0];
      const lastReading = memoryReadings[memoryReadings.length - 1];

      // Allow for some variation but should not grow significantly
      expect(lastReading).toBeLessThan(firstReading * 2);
      expect(lastReading).toBeLessThan(10); // Should stay under 10MB
    });
  });

  describe('Edge Cases', () => {
    test('handles undefined and null gracefully', () => {
      expect(() => {
        errorMonitor.trackError(ErrorCategory.NETWORK, '', undefined, undefined);
      }).not.toThrow();

      expect(() => {
        errorMonitor.trackError(ErrorCategory.NETWORK, null as any);
      }).not.toThrow();
    });

    test('handles concurrent operations', () => {
      const promises = [];

      // Simulate concurrent error tracking
      for (let i = 0; i < 100; i++) {
        promises.push(
          Promise.resolve().then(() => {
            errorMonitor.trackError(ErrorCategory.NETWORK, `concurrent-${i}`);
          })
        );
      }

      return Promise.all(promises).then(() => {
        const stats = errorMonitor.getStats();
        expect(stats.totalErrors).toBeGreaterThan(0);
        expect(stats.totalErrors).toBeLessThanOrEqual(100);
      });
    });

    test('recovers from errors in callbacks', () => {
      const badCallback = vi.fn(() => {
        throw new Error('Callback error');
      });

      const goodCallback = vi.fn();

      errorMonitor.subscribe(badCallback);
      errorMonitor.subscribe(goodCallback);

      // Track an error - bad callback will throw but shouldn't break the system
      errorMonitor.trackError(ErrorCategory.NETWORK, 'test');

      // Good callback should still be called
      expect(goodCallback).toHaveBeenCalled();

      // System should continue working
      const stats = errorMonitor.getStats();
      expect(stats.totalErrors).toBeGreaterThan(0);
    });
  });
});