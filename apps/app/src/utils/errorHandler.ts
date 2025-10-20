/**
 * Error Handler - Centralized error handling with recovery strategies
 */

import { KlineResponse } from '../services/klineDataService';
import { Kline } from '../../types';

export enum ErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  REDIS_UNAVAILABLE = 'REDIS_UNAVAILABLE',
  EDGE_FUNCTION_ERROR = 'EDGE_FUNCTION_ERROR',
  RATE_LIMIT = 'RATE_LIMIT',
  INVALID_DATA = 'INVALID_DATA',
  TIMEOUT = 'TIMEOUT'
}

export interface ErrorContext {
  type: ErrorType;
  message: string;
  details?: any;
  timestamp: number;
  retryCount: number;
  recoverable: boolean;
}

export class DataFetchError extends Error {
  constructor(
    public type: ErrorType,
    message: string,
    public details?: any,
    public recoverable: boolean = true
  ) {
    super(message);
    this.name = 'DataFetchError';
  }
}

/**
 * Error recovery strategies
 */
export class ErrorRecovery {
  private static retryDelays = [1000, 2000, 5000, 10000]; // Exponential backoff
  private static errorLog: ErrorContext[] = [];
  private static maxErrorLog = 100;

  /**
   * Log error for analysis
   */
  static logError(error: ErrorContext): void {
    this.errorLog.push(error);
    if (this.errorLog.length > this.maxErrorLog) {
      this.errorLog.shift();
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('[ErrorHandler]', error);
    }
  }

  /**
   * Determine error type from error object
   */
  static classifyError(error: any): ErrorType {
    if (!error) return ErrorType.NETWORK_ERROR;

    const message = error.message?.toLowerCase() || '';

    if (message.includes('redis') || message.includes('cache')) {
      return ErrorType.REDIS_UNAVAILABLE;
    }
    if (message.includes('rate') || message.includes('limit')) {
      return ErrorType.RATE_LIMIT;
    }
    if (message.includes('timeout') || error.name === 'AbortError') {
      return ErrorType.TIMEOUT;
    }
    if (message.includes('edge') || message.includes('function')) {
      return ErrorType.EDGE_FUNCTION_ERROR;
    }
    if (message.includes('invalid') || message.includes('parse')) {
      return ErrorType.INVALID_DATA;
    }

    return ErrorType.NETWORK_ERROR;
  }

  /**
   * Get retry delay based on error type and retry count
   */
  static getRetryDelay(errorType: ErrorType, retryCount: number): number {
    if (errorType === ErrorType.RATE_LIMIT) {
      return 60000; // Wait 1 minute for rate limits
    }

    const index = Math.min(retryCount, this.retryDelays.length - 1);
    return this.retryDelays[index];
  }

  /**
   * Determine if error is recoverable
   */
  static isRecoverable(errorType: ErrorType): boolean {
    switch (errorType) {
      case ErrorType.INVALID_DATA:
        return false; // Can't recover from bad data
      case ErrorType.RATE_LIMIT:
      case ErrorType.NETWORK_ERROR:
      case ErrorType.TIMEOUT:
      case ErrorType.REDIS_UNAVAILABLE:
        return true; // Can retry these
      default:
        return true;
    }
  }

  /**
   * Create fallback response
   */
  static createFallbackResponse(
    symbol: string,
    timeframe: string,
    error: ErrorContext
  ): KlineResponse {
    return {
      klines: [],
      ticker: null,
      symbol,
      timeframe,
      count: 0,
      cached: false,
      latency: 0,
      error: this.getUserFriendlyMessage(error.type)
    };
  }

  /**
   * Get user-friendly error message
   */
  static getUserFriendlyMessage(errorType: ErrorType): string {
    switch (errorType) {
      case ErrorType.NETWORK_ERROR:
        return 'Unable to fetch data. Please check your connection.';
      case ErrorType.REDIS_UNAVAILABLE:
        return 'Data service temporarily unavailable. Please try again.';
      case ErrorType.EDGE_FUNCTION_ERROR:
        return 'Server error. Our team has been notified.';
      case ErrorType.RATE_LIMIT:
        return 'Too many requests. Please wait a moment.';
      case ErrorType.INVALID_DATA:
        return 'Received invalid data. Please refresh.';
      case ErrorType.TIMEOUT:
        return 'Request timed out. Please try again.';
      default:
        return 'An unexpected error occurred.';
    }
  }

  /**
   * Get recent errors for debugging
   */
  static getRecentErrors(count: number = 10): ErrorContext[] {
    return this.errorLog.slice(-count);
  }

  /**
   * Clear error log
   */
  static clearErrorLog(): void {
    this.errorLog = [];
  }

  /**
   * Check if we should fail fast based on recent errors
   */
  static shouldFailFast(): boolean {
    const recentErrors = this.errorLog.slice(-10);
    const criticalErrors = recentErrors.filter(
      e => e.type === ErrorType.REDIS_UNAVAILABLE ||
           e.type === ErrorType.EDGE_FUNCTION_ERROR
    );

    // Fail fast if more than 5 critical errors in last 10
    return criticalErrors.length > 5;
  }
}

/**
 * Retry wrapper with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  context: string = 'Operation'
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      const errorType = ErrorRecovery.classifyError(error);
      const errorContext: ErrorContext = {
        type: errorType,
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error,
        timestamp: Date.now(),
        retryCount: attempt,
        recoverable: ErrorRecovery.isRecoverable(errorType)
      };

      ErrorRecovery.logError(errorContext);

      if (!errorContext.recoverable || attempt === maxRetries) {
        throw new DataFetchError(
          errorType,
          `${context} failed after ${attempt + 1} attempts`,
          error,
          false
        );
      }

      const delay = ErrorRecovery.getRetryDelay(errorType, attempt);
      console.log(`[ErrorHandler] Retrying ${context} in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Circuit breaker pattern for failing services
 */
export class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000 // 1 minute
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new DataFetchError(
          ErrorType.EDGE_FUNCTION_ERROR,
          'Service circuit breaker is open',
          { state: this.state, failureCount: this.failureCount },
          false
        );
      }
    }

    try {
      const result = await operation();

      if (this.state === 'HALF_OPEN') {
        this.reset();
      }

      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      console.error('[CircuitBreaker] Opening circuit after', this.failureCount, 'failures');
    }
  }

  private reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.state = 'CLOSED';
    console.log('[CircuitBreaker] Circuit reset');
  }

  getState(): string {
    return this.state;
  }
}