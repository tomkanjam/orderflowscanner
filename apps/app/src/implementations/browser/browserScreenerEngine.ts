import { IScreenerEngine, MarketData, FilterResult, UpdateCallback } from '../../abstractions/interfaces';
import * as helpers from '../../../screenerHelpers';

export class BrowserScreenerEngine implements IScreenerEngine {
  private updateCallbacks: Set<UpdateCallback> = new Set();
  private isSubscribed = false;

  async executeFilter(filterCode: string, marketData: Map<string, MarketData>): Promise<FilterResult[]> {
    try {
      // Create a safe execution environment with helper functions
      const safeGlobals = {
        ...helpers,
        Math,
        Date,
        console: { log: () => {} }, // Disable console in filter execution
      };

      // Create filter function
      const filterFunction = new Function(
        ...Object.keys(safeGlobals),
        'pairs',
        `
        "use strict";
        const results = [];
        ${filterCode}
        return results;
        `
      );

      // Execute filter
      const results = filterFunction(
        ...Object.values(safeGlobals),
        Array.from(marketData.values())
      );

      return results.map((result: any) => ({
        symbol: result.symbol,
        price: result.price || result.c || 0,
        change24h: result.change24h || result.P || 0,
        volume24h: result.volume24h || result.v || 0,
        matchedConditions: result.matchedConditions || [],
      }));
    } catch (error) {
      console.error('Filter execution error:', error);
      throw new Error(`Filter execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async validateFilterCode(filterCode: string): Promise<{ valid: boolean; error?: string }> {
    try {
      // Basic syntax validation
      new Function(filterCode);
      
      // Check for dangerous patterns
      const dangerousPatterns = [
        /eval\s*\(/,
        /Function\s*\(/,
        /import\s+/,
        /require\s*\(/,
        /fetch\s*\(/,
        /XMLHttpRequest/,
        /localStorage/,
        /sessionStorage/,
        /document\./,
        /window\./,
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(filterCode)) {
          return {
            valid: false,
            error: `Potentially unsafe code pattern detected: ${pattern.source}`,
          };
        }
      }

      // Test execution with dummy data
      const testData = new Map([
        ['BTCUSDT', {
          symbol: 'BTCUSDT',
          price: 50000,
          volume: 1000000,
          klines: [],
        }],
      ]);

      await this.executeFilter(filterCode, testData);

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid filter code',
      };
    }
  }

  subscribeToUpdates(callback: UpdateCallback): () => void {
    this.updateCallbacks.add(callback);

    // Start WebSocket subscription if not already active
    if (!this.isSubscribed) {
      this.startWebSocketSubscription();
    }

    // Return unsubscribe function
    return () => {
      this.updateCallbacks.delete(callback);
      if (this.updateCallbacks.size === 0) {
        this.stopWebSocketSubscription();
      }
    };
  }

  private startWebSocketSubscription() {
    this.isSubscribed = true;
    // Subscribe to ticker updates
    binanceService.subscribeToTickers((ticker: any) => {
      const marketData: MarketData = {
        symbol: ticker.s,
        price: parseFloat(ticker.c),
        volume: parseFloat(ticker.v),
        klines: [], // Would need to fetch separately
      };
      
      // Notify all callbacks
      this.updateCallbacks.forEach(callback => {
        try {
          callback(marketData);
        } catch (error) {
          console.error('Update callback error:', error);
        }
      });
    });
  }

  private stopWebSocketSubscription() {
    this.isSubscribed = false;
    // In a real implementation, we'd unsubscribe from WebSocket
    // For now, binanceService doesn't expose unsubscribe
  }
}