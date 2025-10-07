/**
 * TraderPreferenceStore - Manages per-user trader preferences in localStorage
 *
 * Storage format in localStorage:
 * Key: `trader_prefs_${userId || 'anon'}`
 * Value: { [traderId: string]: boolean }
 *
 * This allows users to enable/disable built-in traders independently of the database,
 * creating a personalized experience while keeping built-in traders shared across all users.
 */

export class TraderPreferenceStore {
  private static readonly KEY_PREFIX = 'trader_prefs_';
  private inMemoryFallback: Map<string, Record<string, boolean>> = new Map();
  private useInMemory = false;

  constructor() {
    // Test localStorage availability on initialization
    try {
      const testKey = '__trader_prefs_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
    } catch (e) {
      console.warn('[TraderPreferences] localStorage unavailable, using in-memory fallback');
      this.useInMemory = true;
    }
  }

  private getKey(userId?: string): string {
    return `${TraderPreferenceStore.KEY_PREFIX}${userId || 'anon'}`;
  }

  /**
   * Get user's preference for a specific trader
   * @param traderId - The trader ID to check
   * @param userId - Optional user ID (defaults to 'anon' for anonymous users)
   * @returns boolean if preference is set, null if no preference exists
   */
  getTraderEnabled(traderId: string, userId?: string): boolean | null {
    const key = this.getKey(userId);

    try {
      if (this.useInMemory) {
        const prefs = this.inMemoryFallback.get(key) || {};
        return prefs[traderId] ?? null;
      }

      const stored = localStorage.getItem(key);
      if (!stored) return null;

      const prefs = JSON.parse(stored);
      return prefs[traderId] ?? null;
    } catch (error) {
      console.error('[TraderPreferences] Error reading preference:', error);
      return null;
    }
  }

  /**
   * Set user's preference for a specific trader
   * @param traderId - The trader ID to update
   * @param enabled - Whether the trader should be enabled
   * @param userId - Optional user ID (defaults to 'anon' for anonymous users)
   */
  setTraderEnabled(traderId: string, enabled: boolean, userId?: string): void {
    const key = this.getKey(userId);

    try {
      if (this.useInMemory) {
        const prefs = this.inMemoryFallback.get(key) || {};
        prefs[traderId] = enabled;
        this.inMemoryFallback.set(key, prefs);
        console.log(`[TraderPreferences] Set trader ${traderId} to ${enabled} (in-memory)`);
        return;
      }

      const stored = localStorage.getItem(key);
      const prefs = stored ? JSON.parse(stored) : {};
      prefs[traderId] = enabled;

      localStorage.setItem(key, JSON.stringify(prefs));
      console.log(`[TraderPreferences] Set trader ${traderId} to ${enabled} for user ${userId || 'anon'}`);

      // Emit storage event for cross-tab synchronization
      // This allows other tabs to detect preference changes
      window.dispatchEvent(new StorageEvent('storage', {
        key,
        newValue: JSON.stringify(prefs),
        storageArea: localStorage
      }));
    } catch (error) {
      console.error('[TraderPreferences] Error saving preference:', error);

      // Handle quota exceeded error gracefully
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn('[TraderPreferences] localStorage quota exceeded');
        // Fallback to in-memory storage for this session
        this.useInMemory = true;
        const prefs = this.inMemoryFallback.get(key) || {};
        prefs[traderId] = enabled;
        this.inMemoryFallback.set(key, prefs);
      }
    }
  }

  /**
   * Clear all preferences for a user
   * @param userId - Optional user ID (defaults to 'anon' for anonymous users)
   */
  clearAllPreferences(userId?: string): void {
    const key = this.getKey(userId);

    try {
      if (this.useInMemory) {
        this.inMemoryFallback.delete(key);
        console.log(`[TraderPreferences] Cleared all preferences for user ${userId || 'anon'} (in-memory)`);
        return;
      }

      localStorage.removeItem(key);
      console.log(`[TraderPreferences] Cleared all preferences for user ${userId || 'anon'}`);
    } catch (error) {
      console.error('[TraderPreferences] Error clearing preferences:', error);
    }
  }

  /**
   * Get all preferences for a user
   * @param userId - Optional user ID (defaults to 'anon' for anonymous users)
   * @returns Record of trader IDs to their enabled state
   */
  getAllPreferences(userId?: string): Record<string, boolean> {
    const key = this.getKey(userId);

    try {
      if (this.useInMemory) {
        return this.inMemoryFallback.get(key) || {};
      }

      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('[TraderPreferences] Error reading all preferences:', error);
      return {};
    }
  }
}

// Singleton instance - export for use across the application
export const traderPreferences = new TraderPreferenceStore();
