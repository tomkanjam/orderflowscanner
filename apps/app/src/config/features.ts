/**
 * Feature Flags Configuration
 * 
 * Controls gradual rollout of features and A/B testing.
 * Flags can be toggled at runtime without restart.
 */

export interface FeatureFlag {
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number; // 0-100
  enabledForUsers?: string[]; // Specific user IDs
  metadata?: Record<string, any>;
}

export class FeatureFlags {
  private static instance: FeatureFlags;
  private flags: Map<string, FeatureFlag> = new Map();
  private userMetrics: Map<string, any> = new Map();
  
  // Feature flag keys
  static readonly PER_SYMBOL_TRACKING = 'per_symbol_tracking';
  static readonly DOUBLE_BUFFERING = 'double_buffering';
  static readonly ERROR_RECOVERY = 'error_recovery';
  static readonly PERFORMANCE_MONITOR = 'performance_monitor';
  
  private constructor() {
    this.initializeFlags();
    this.loadFromLocalStorage();
  }
  
  static getInstance(): FeatureFlags {
    if (!FeatureFlags.instance) {
      FeatureFlags.instance = new FeatureFlags();
    }
    return FeatureFlags.instance;
  }
  
  private initializeFlags() {
    // Per-Symbol Update Tracking
    this.flags.set(FeatureFlags.PER_SYMBOL_TRACKING, {
      name: 'Per-Symbol Update Tracking',
      description: 'Only process symbols that have changed data',
      enabled: true, // Default enabled for immediate CPU savings
      rolloutPercentage: 100,
      metadata: {
        expectedCpuSavings: 80,
        expectedEfficiency: 85
      }
    });
    
    // Double Buffering
    this.flags.set(FeatureFlags.DOUBLE_BUFFERING, {
      name: 'Double Buffering',
      description: 'Use double buffering to prevent race conditions',
      enabled: true,
      rolloutPercentage: 100,
      metadata: {
        bufferSize: '2x',
        swapInterval: 1000
      }
    });
    
    // Error Recovery
    this.flags.set(FeatureFlags.ERROR_RECOVERY, {
      name: 'Automatic Error Recovery',
      description: 'Automatically recover from buffer corruption and errors',
      enabled: true,
      rolloutPercentage: 100,
      metadata: {
        maxErrorsPerMinute: 5,
        recoveryDelay: 5000
      }
    });
    
    // Performance Monitor
    this.flags.set(FeatureFlags.PERFORMANCE_MONITOR, {
      name: 'Performance Monitoring Dashboard',
      description: 'Show real-time performance metrics overlay',
      enabled: false, // User must opt-in
      rolloutPercentage: 100,
      metadata: {
        updateInterval: 1000
      }
    });
  }
  
  private loadFromLocalStorage() {
    try {
      const stored = localStorage.getItem('featureFlags');
      if (stored) {
        const parsed = JSON.parse(stored);
        Object.entries(parsed).forEach(([key, value]) => {
          const existing = this.flags.get(key);
          if (existing && typeof value === 'object') {
            this.flags.set(key, { ...existing, ...value as FeatureFlag });
          }
        });
      }
    } catch (error) {
      console.error('[FeatureFlags] Failed to load from localStorage:', error);
    }
  }
  
  private saveToLocalStorage() {
    try {
      const toSave: Record<string, any> = {};
      this.flags.forEach((flag, key) => {
        toSave[key] = {
          enabled: flag.enabled,
          rolloutPercentage: flag.rolloutPercentage,
          enabledForUsers: flag.enabledForUsers
        };
      });
      localStorage.setItem('featureFlags', JSON.stringify(toSave));
    } catch (error) {
      console.error('[FeatureFlags] Failed to save to localStorage:', error);
    }
  }
  
  /**
   * Check if a feature is enabled for the current user
   */
  isEnabled(flagKey: string, userId?: string): boolean {
    const flag = this.flags.get(flagKey);
    if (!flag) return false;
    
    // Check if globally disabled
    if (!flag.enabled) return false;
    
    // Check if enabled for specific user
    if (userId && flag.enabledForUsers?.includes(userId)) {
      return true;
    }
    
    // Check rollout percentage
    if (flag.rolloutPercentage < 100) {
      // Use consistent hash for user to ensure stable assignment
      const hash = userId ? this.hashUserId(userId) : Math.random();
      return hash * 100 < flag.rolloutPercentage;
    }
    
    return true;
  }
  
  /**
   * Toggle a feature flag
   */
  toggle(flagKey: string, enabled?: boolean) {
    const flag = this.flags.get(flagKey);
    if (!flag) return;
    
    flag.enabled = enabled !== undefined ? enabled : !flag.enabled;
    this.saveToLocalStorage();
    
    // Notify listeners
    this.notifyChange(flagKey, flag.enabled);
    
    // Track metrics
    this.trackToggle(flagKey, flag.enabled);
  }
  
  /**
   * Set rollout percentage for gradual deployment
   */
  setRolloutPercentage(flagKey: string, percentage: number) {
    const flag = this.flags.get(flagKey);
    if (!flag) return;
    
    flag.rolloutPercentage = Math.max(0, Math.min(100, percentage));
    this.saveToLocalStorage();
  }
  
  /**
   * Enable feature for specific users
   */
  enableForUsers(flagKey: string, userIds: string[]) {
    const flag = this.flags.get(flagKey);
    if (!flag) return;
    
    flag.enabledForUsers = userIds;
    this.saveToLocalStorage();
  }
  
  /**
   * Get all feature flags
   */
  getAllFlags(): Map<string, FeatureFlag> {
    return new Map(this.flags);
  }
  
  /**
   * Get flag configuration
   */
  getFlag(flagKey: string): FeatureFlag | undefined {
    return this.flags.get(flagKey);
  }
  
  /**
   * Track A/B test metrics
   */
  trackMetric(flagKey: string, metric: string, value: any) {
    const key = `${flagKey}:${metric}`;
    const existing = this.userMetrics.get(key) || [];
    existing.push({ value, timestamp: Date.now() });
    
    // Keep only last 100 metrics
    if (existing.length > 100) {
      existing.shift();
    }
    
    this.userMetrics.set(key, existing);
  }
  
  /**
   * Get A/B test metrics
   */
  getMetrics(flagKey: string): Record<string, any> {
    const metrics: Record<string, any> = {};
    
    this.userMetrics.forEach((value, key) => {
      if (key.startsWith(`${flagKey}:`)) {
        const metricName = key.split(':')[1];
        metrics[metricName] = value;
      }
    });
    
    return metrics;
  }
  
  /**
   * Compare performance between enabled/disabled states
   */
  comparePerformance(flagKey: string): {
    enabled: Record<string, number>;
    disabled: Record<string, number>;
    improvement: Record<string, number>;
  } {
    const enabledMetrics = this.getMetrics(`${flagKey}:enabled`);
    const disabledMetrics = this.getMetrics(`${flagKey}:disabled`);
    
    const improvement: Record<string, number> = {};
    
    // Calculate improvements
    Object.keys(enabledMetrics).forEach(metric => {
      if (disabledMetrics[metric]) {
        const enabledAvg = this.calculateAverage(enabledMetrics[metric]);
        const disabledAvg = this.calculateAverage(disabledMetrics[metric]);
        improvement[metric] = ((disabledAvg - enabledAvg) / disabledAvg) * 100;
      }
    });
    
    return {
      enabled: this.summarizeMetrics(enabledMetrics),
      disabled: this.summarizeMetrics(disabledMetrics),
      improvement
    };
  }
  
  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) / 2147483647; // Normalize to 0-1
  }
  
  private notifyChange(flagKey: string, enabled: boolean) {
    // Dispatch custom event for listeners
    window.dispatchEvent(new CustomEvent('featureFlagChanged', {
      detail: { flagKey, enabled }
    }));
  }
  
  private trackToggle(flagKey: string, enabled: boolean) {
    console.log(`[FeatureFlags] ${flagKey} ${enabled ? 'enabled' : 'disabled'}`);
    this.trackMetric(flagKey, 'toggles', { enabled, timestamp: Date.now() });
  }
  
  private calculateAverage(values: any[]): number {
    if (!values || values.length === 0) return 0;
    const sum = values.reduce((acc, v) => acc + (typeof v.value === 'number' ? v.value : 0), 0);
    return sum / values.length;
  }
  
  private summarizeMetrics(metrics: Record<string, any>): Record<string, number> {
    const summary: Record<string, number> = {};
    
    Object.entries(metrics).forEach(([key, values]) => {
      summary[key] = this.calculateAverage(values);
    });
    
    return summary;
  }
}

// Export singleton instance
export const featureFlags = FeatureFlags.getInstance();