/**
 * Activity Tracker Service
 * Tracks and manages signal/trader activity timestamps for visual indicators
 */

export interface ActivityRecord {
  timestamp: number;
  type: 'trigger' | 'update' | 'position_change';
  metadata?: {
    symbol?: string;
    price?: number;
    change?: number;
  };
}

class ActivityTracker {
  private activities = new Map<string, ActivityRecord[]>();
  private readonly MAX_RECORDS_PER_SIGNAL = 10;
  private readonly ACTIVITY_WINDOWS = {
    TRIGGERED: 60 * 1000,      // 1 minute - show as "just triggered"
    RECENT: 5 * 60 * 1000,      // 5 minutes - show as "recent activity"
    HIGH_ACTIVITY: 60 * 60 * 1000, // 1 hour - for high activity detection
  } as const;

  /**
   * Record activity for a signal/trader
   */
  recordActivity(
    signalId: string, 
    type: ActivityRecord['type'] = 'trigger',
    metadata?: ActivityRecord['metadata']
  ): void {
    const record: ActivityRecord = {
      timestamp: Date.now(),
      type,
      metadata,
    };

    const existing = this.activities.get(signalId) || [];
    const updated = [record, ...existing].slice(0, this.MAX_RECORDS_PER_SIGNAL);
    this.activities.set(signalId, updated);
  }

  /**
   * Get the last activity timestamp for a signal
   */
  getLastActivity(signalId: string): number | undefined {
    const records = this.activities.get(signalId);
    return records?.[0]?.timestamp;
  }

  /**
   * Get all activity records for a signal
   */
  getActivityRecords(signalId: string): ActivityRecord[] {
    return this.activities.get(signalId) || [];
  }

  /**
   * Check if signal was recently triggered (within 1 minute)
   */
  isTriggered(signalId: string): boolean {
    const lastActivity = this.getLastActivity(signalId);
    if (!lastActivity) return false;
    
    const records = this.activities.get(signalId) || [];
    const lastTrigger = records.find(r => r.type === 'trigger');
    if (!lastTrigger) return false;
    
    return Date.now() - lastTrigger.timestamp < this.ACTIVITY_WINDOWS.TRIGGERED;
  }

  /**
   * Check if signal has recent activity (within 5 minutes)
   */
  isRecent(signalId: string): boolean {
    const lastActivity = this.getLastActivity(signalId);
    return lastActivity ? Date.now() - lastActivity < this.ACTIVITY_WINDOWS.RECENT : false;
  }

  /**
   * Check if signal has high activity (multiple triggers in last hour)
   */
  hasHighActivity(signalId: string, threshold: number = 5): boolean {
    const records = this.activities.get(signalId) || [];
    const recentTriggers = records.filter(
      r => r.type === 'trigger' && 
      Date.now() - r.timestamp < this.ACTIVITY_WINDOWS.HIGH_ACTIVITY
    );
    return recentTriggers.length >= threshold;
  }

  /**
   * Get activity state for UI rendering
   */
  getActivityState(signalId: string): 'triggered' | 'recent' | 'high' | 'idle' {
    if (this.isTriggered(signalId)) return 'triggered';
    if (this.hasHighActivity(signalId)) return 'high';
    if (this.isRecent(signalId)) return 'recent';
    return 'idle';
  }

  /**
   * Clear activity records for a signal
   */
  clearActivity(signalId: string): void {
    this.activities.delete(signalId);
  }

  /**
   * Clear all activity records
   */
  clearAll(): void {
    this.activities.clear();
  }

  /**
   * Get activity statistics for debugging
   */
  getStats(): {
    totalSignals: number;
    totalRecords: number;
    activeSignals: number;
  } {
    const totalSignals = this.activities.size;
    const totalRecords = Array.from(this.activities.values())
      .reduce((sum, records) => sum + records.length, 0);
    const activeSignals = Array.from(this.activities.keys())
      .filter(id => this.isRecent(id)).length;

    return { totalSignals, totalRecords, activeSignals };
  }
}

// Export singleton instance
export const activityTracker = new ActivityTracker();

// Export for testing
export { ActivityTracker };