/**
 * Go Backend API Client
 *
 * Communicates with the Golang backend for filter execution via Yaegi interpreter
 */

export interface MarketData {
  symbol: string;
  ticker: {
    lastPrice: number;
    priceChangePercent: number;
    quoteVolume: number;
  };
  klines: Record<string, Array<{
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>>;
}

export interface ExecuteFilterRequest {
  code: string;
  marketData: MarketData;
}

export interface ExecuteFilterResponse {
  matched: boolean;
  error?: string;
}

export interface ValidateCodeRequest {
  code: string;
}

export interface ValidateCodeResponse {
  valid: boolean;
  error?: string;
}

export class GoBackendClient {
  private baseURL: string;
  private timeout: number;

  constructor(baseURL: string = 'http://localhost:8080', timeout: number = 5000) {
    this.baseURL = baseURL.replace(/\/$/, ''); // Remove trailing slash
    this.timeout = timeout;
  }

  /**
   * Execute a Go filter against market data
   */
  async executeFilter(code: string, marketData: MarketData): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseURL}/api/v1/execute-filter`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          marketData,
        } as ExecuteFilterRequest),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Filter execution failed (${response.status}): ${errorText}`);
      }

      const result: ExecuteFilterResponse = await response.json();

      if (result.error) {
        console.error('Filter execution error:', result.error);
        return false;
      }

      return result.matched;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Filter execution timeout after ${this.timeout}ms`);
      }

      throw error;
    }
  }

  /**
   * Validate Go code syntax
   */
  async validateCode(code: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseURL}/api/v1/validate-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
        } as ValidateCodeRequest),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          valid: false,
          error: `Validation request failed (${response.status}): ${errorText}`,
        };
      }

      const result: ValidateCodeResponse = await response.json();
      return result;
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }

  /**
   * Health check
   */
  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/health`, {
        method: 'GET',
      });

      return response.ok;
    } catch (error) {
      console.error('Go backend health check failed:', error);
      return false;
    }
  }

  /**
   * Set the base URL for the backend
   */
  setBaseURL(baseURL: string) {
    this.baseURL = baseURL.replace(/\/$/, '');
  }

  /**
   * Set the timeout for requests
   */
  setTimeout(timeout: number) {
    this.timeout = timeout;
  }
}

// Singleton instance
export const goBackendClient = new GoBackendClient(
  import.meta.env.VITE_GO_BACKEND_URL || 'http://localhost:8080'
);
