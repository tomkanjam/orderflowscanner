/**
 * Differential Tracker for Worker Updates
 * 
 * Tracks changes in traders to send only necessary updates to workers,
 * reducing message traffic and preventing redundant operations.
 */

import { Trader } from '../../types';
import { KlineInterval } from '../../types';
import { isTraderEqual } from './traderEquality';

export interface TraderExecution {
  traderId: string;
  filterCode: string;
  refreshInterval: KlineInterval;
  requiredTimeframes: KlineInterval[];
}

export interface DifferentialChanges {
  toAdd: TraderExecution[];
  toUpdate: TraderExecution[];
  toRemove: string[];
}

export class DifferentialTracker {
  private previous: Map<string, TraderExecution> = new Map();
  
  /**
   * Compute changes between previous and current trader state
   */
  computeChanges(currentTraders: Trader[]): DifferentialChanges {
    const current = new Map<string, TraderExecution>();
    const toAdd: TraderExecution[] = [];
    const toUpdate: TraderExecution[] = [];
    const toRemove: string[] = [];
    
    // Build current map and identify additions/updates
    currentTraders.forEach(trader => {
      // Only process enabled traders with filter code
      if (!trader.enabled || !trader.filter?.code) {
        return;
      }
      
      const execution = this.createTraderExecution(trader);
      current.set(trader.id, execution);
      
      const previousExecution = this.previous.get(trader.id);
      
      if (!previousExecution) {
        // New trader
        toAdd.push(execution);
        console.log(`[DifferentialTracker] New trader: ${trader.id}`);
      } else if (!this.isExecutionEqual(previousExecution, execution)) {
        // Updated trader
        toUpdate.push(execution);
        console.log(`[DifferentialTracker] Updated trader: ${trader.id}`);
      }
      // If equal, no action needed (implicit skip)
    });
    
    // Identify removals
    this.previous.forEach((_, traderId) => {
      if (!current.has(traderId)) {
        toRemove.push(traderId);
        console.log(`[DifferentialTracker] Removed trader: ${traderId}`);
      }
    });
    
    // Update previous state for next comparison
    this.previous = current;
    
    // Log summary
    if (toAdd.length > 0 || toUpdate.length > 0 || toRemove.length > 0) {
      console.log(`[DifferentialTracker] Changes: +${toAdd.length}, ~${toUpdate.length}, -${toRemove.length}`);
    } else {
      console.log(`[DifferentialTracker] No changes detected`);
    }
    
    return { toAdd, toUpdate, toRemove };
  }
  
  /**
   * Create execution object from trader
   */
  private createTraderExecution(trader: Trader): TraderExecution {
    return {
      traderId: trader.id,
      filterCode: trader.filter?.code || '',
      refreshInterval: trader.filter?.refreshInterval || KlineInterval.ONE_MINUTE,
      requiredTimeframes: trader.filter?.requiredTimeframes || [KlineInterval.ONE_MINUTE]
    };
  }
  
  /**
   * Compare two execution objects for equality
   */
  private isExecutionEqual(a: TraderExecution, b: TraderExecution): boolean {
    return a.traderId === b.traderId &&
           a.filterCode === b.filterCode &&
           a.refreshInterval === b.refreshInterval &&
           JSON.stringify(a.requiredTimeframes) === JSON.stringify(b.requiredTimeframes);
  }
  
  /**
   * Clear all tracked state
   */
  clear(): void {
    this.previous.clear();
    console.log(`[DifferentialTracker] Cleared all tracked state`);
  }
  
  /**
   * Get current tracking statistics
   */
  getStats(): { trackedCount: number } {
    return {
      trackedCount: this.previous.size
    };
  }
}