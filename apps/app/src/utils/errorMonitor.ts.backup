/**
 * ErrorMonitor - Centralized error tracking and monitoring
 * Features:
 * - Error categorization (network, data, realtime, etc.)
 * - Error frequency tracking
 * - Alert thresholds for critical issues
 * - Performance degradation detection
 */

export enum ErrorCategory {
  NETWORK = 'network',
  REALTIME = 'realtime',
  DATA_FETCH = 'data_fetch',
  CACHE = 'cache',
  WEBSOCKET = 'websocket',
  PARSING = 'parsing',
  UNKNOWN = 'unknown'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ErrorEvent {
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  error?: Error;
  metadata?: Record<string, any>;
  timestamp: number;
  count: number;
}

export interface ErrorStats {
  totalErrors: number;
  errorsByCategory: Map<ErrorCategory, number>;
  errorsBySeverity: Map<ErrorSeverity, number>;
  recentErrors: ErrorEvent[];
  criticalAlerts: ErrorEvent[];
  errorRate: number; // errors per minute
}

interface AlertThreshold {
  category: ErrorCategory;
  maxPerMinute: number;
  severity: ErrorSeverity;
}

class ErrorMonitor {
  private errors: Map<string, ErrorEvent>;
  private errorHistory: ErrorEvent[];
  private alertThresholds: AlertThreshold[];
  private callbacks: Set<(event: ErrorEvent) => void>;
  private windowSize = 60 * 1000; // 1 minute window for rate calculation
  private maxHistorySize = 100;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.errors = new Map();
    this.errorHistory = [];
    this.callbacks = new Set();

    // Default alert thresholds
    this.alertThresholds = [
      { category: ErrorCategory.NETWORK, maxPerMinute: 10, severity: ErrorSeverity.HIGH },
      { category: ErrorCategory.REALTIME, maxPerMinute: 5, severity: ErrorSeverity.CRITICAL },
      { category: ErrorCategory.DATA_FETCH, maxPerMinute: 20, severity: ErrorSeverity.MEDIUM },
      { category: ErrorCategory.CACHE, maxPerMinute: 50, severity: ErrorSeverity.LOW },
    ];

    // Start monitoring interval
    this.startMonitoring();
  }

  /**
   * Track an error event
   */
  trackError(
    category: ErrorCategory,
    message: string,
    error?: Error,
    metadata?: Record<string, any>
  ): void {
    const severity = this.determineSeverity(category, error);
    const key = `${category}:${message}`;

    const existingEvent = this.errors.get(key);

    const event: ErrorEvent = existingEvent ? {
      ...existingEvent,
      count: existingEvent.count + 1,
      timestamp: Date.now(),
      error: error || existingEvent.error,
      metadata: { ...existingEvent.metadata, ...metadata }
    } : {
      category,
      severity,
      message,
      error,
      metadata,
      timestamp: Date.now(),
      count: 1
    };

    this.errors.set(key, event);
    this.errorHistory.push(event);

    // Maintain history size
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }

    // Check for threshold violations
    this.checkThresholds(event);

    // Notify callbacks
    this.notifyCallbacks(event);

    // Log based on severity
    this.logError(event);
  }

  /**
   * Track network error
   */
  trackNetworkError(url: string, status?: number, message?: string): void {
    this.trackError(
      ErrorCategory.NETWORK,
      message || `Network error: ${url}`,
      undefined,
      { url, status }
    );
  }

  /**
   * Track realtime connection error
   */
  trackRealtimeError(channel: string, message: string, error?: Error): void {
    this.trackError(
      ErrorCategory.REALTIME,
      `Realtime error on ${channel}: ${message}`,
      error,
      { channel }
    );
  }

  /**
   * Track data fetch error
   */
  trackDataFetchError(symbol: string, timeframe: string, error: Error): void {
    this.trackError(
      ErrorCategory.DATA_FETCH,
      `Failed to fetch ${symbol}:${timeframe}`,
      error,
      { symbol, timeframe }
    );
  }

  /**
   * Get current error statistics
   */
  getStats(): ErrorStats {
    const now = Date.now();
    const windowStart = now - this.windowSize;

    // Calculate recent errors
    const recentErrors = this.errorHistory.filter(e => e.timestamp > windowStart);

    // Calculate error rate
    const errorRate = (recentErrors.length / (this.windowSize / 60000)); // per minute

    // Categorize errors
    const errorsByCategory = new Map<ErrorCategory, number>();
    const errorsBySeverity = new Map<ErrorSeverity, number>();

    for (const event of this.errors.values()) {
      errorsByCategory.set(
        event.category,
        (errorsByCategory.get(event.category) || 0) + event.count
      );

      errorsBySeverity.set(
        event.severity,
        (errorsBySeverity.get(event.severity) || 0) + event.count
      );
    }

    // Get critical alerts
    const criticalAlerts = Array.from(this.errors.values())
      .filter(e => e.severity === ErrorSeverity.CRITICAL)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);

    return {
      totalErrors: this.errorHistory.length,
      errorsByCategory,
      errorsBySeverity,
      recentErrors: recentErrors.slice(-10),
      criticalAlerts,
      errorRate
    };
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errors.clear();
    this.errorHistory = [];
    console.log('[ErrorMonitor] History cleared');
  }

  /**
   * Subscribe to error events
   */
  subscribe(callback: (event: ErrorEvent) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Set custom alert threshold
   */
  setAlertThreshold(
    category: ErrorCategory,
    maxPerMinute: number,
    severity: ErrorSeverity = ErrorSeverity.HIGH
  ): void {
    const existing = this.alertThresholds.findIndex(t => t.category === category);

    if (existing >= 0) {
      this.alertThresholds[existing] = { category, maxPerMinute, severity };
    } else {
      this.alertThresholds.push({ category, maxPerMinute, severity });
    }
  }

  /**
   * Check if error recovery is recommended
   */
  shouldRecover(category: ErrorCategory): boolean {
    const stats = this.getStats();
    const categoryErrors = stats.errorsByCategory.get(category) || 0;

    // Recommend recovery if error rate is high
    const threshold = this.alertThresholds.find(t => t.category === category);
    if (threshold && stats.errorRate > threshold.maxPerMinute) {
      return true;
    }

    // Recommend recovery if multiple critical errors
    const criticalCount = stats.criticalAlerts.filter(e => e.category === category).length;
    return criticalCount > 3;
  }

  /**
   * Cleanup and stop monitoring
   */
  cleanup(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.callbacks.clear();
    console.log('[ErrorMonitor] Cleaned up');
  }

  // Private methods

  private determineSeverity(category: ErrorCategory, error?: Error): ErrorSeverity {
    // Network errors
    if (category === ErrorCategory.NETWORK) {
      if (error?.message?.includes('timeout')) return ErrorSeverity.HIGH;
      if (error?.message?.includes('404')) return ErrorSeverity.LOW;
      return ErrorSeverity.MEDIUM;
    }

    // Realtime errors are critical
    if (category === ErrorCategory.REALTIME) {
      return ErrorSeverity.CRITICAL;
    }

    // Data fetch errors
    if (category === ErrorCategory.DATA_FETCH) {
      if (error?.message?.includes('rate limit')) return ErrorSeverity.HIGH;
      return ErrorSeverity.MEDIUM;
    }

    // Cache errors are usually low severity
    if (category === ErrorCategory.CACHE) {
      return ErrorSeverity.LOW;
    }

    return ErrorSeverity.MEDIUM;
  }

  private checkThresholds(event: ErrorEvent): void {
    const threshold = this.alertThresholds.find(t => t.category === event.category);
    if (!threshold) return;

    const now = Date.now();
    const windowStart = now - this.windowSize;

    // Count recent errors of this category
    const recentCount = this.errorHistory.filter(e =>
      e.category === event.category && e.timestamp > windowStart
    ).length;

    // Check if threshold exceeded
    if (recentCount > threshold.maxPerMinute) {
      const alert: ErrorEvent = {
        ...event,
        severity: ErrorSeverity.CRITICAL,
        message: `Alert: ${event.category} error rate exceeded (${recentCount}/${threshold.maxPerMinute} per minute)`
      };

      console.error(`[ErrorMonitor] ALERT: ${alert.message}`);
      this.notifyCallbacks(alert);
    }
  }

  private notifyCallbacks(event: ErrorEvent): void {
    this.callbacks.forEach(cb => {
      try {
        cb(event);
      } catch (error) {
        console.error('[ErrorMonitor] Callback error:', error);
      }
    });
  }

  private logError(event: ErrorEvent): void {
    const prefix = `[ErrorMonitor] [${event.category}] [${event.severity.toUpperCase()}]`;

    switch (event.severity) {
      case ErrorSeverity.CRITICAL:
        console.error(prefix, event.message, event.error, event.metadata);
        break;
      case ErrorSeverity.HIGH:
        console.error(prefix, event.message, event.metadata);
        break;
      case ErrorSeverity.MEDIUM:
        console.warn(prefix, event.message, event.metadata);
        break;
      case ErrorSeverity.LOW:
        if (process.env.NODE_ENV === 'development') {
          console.log(prefix, event.message, event.metadata);
        }
        break;
    }
  }

  private startMonitoring(): void {
    // Check for stale errors every minute
    this.checkInterval = setInterval(() => {
      const now = Date.now();
      const staleThreshold = now - (5 * 60 * 1000); // 5 minutes

      // Clean up old errors
      for (const [key, event] of this.errors.entries()) {
        if (event.timestamp < staleThreshold) {
          this.errors.delete(key);
        }
      }
    }, 60 * 1000);
  }
}

// Singleton instance
export const errorMonitor = new ErrorMonitor();