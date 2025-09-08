/**
 * Trader Equality Utilities
 * 
 * Prevents unnecessary React re-renders by comparing trader objects
 * to determine if they have actually changed.
 */

import { Trader } from '../../types';

/**
 * Deep equality check for individual traders
 * Compares all relevant properties that affect functionality
 */
export function isTraderEqual(a: Trader, b: Trader): boolean {
  // Basic property checks
  if (a.id !== b.id) return false;
  if (a.enabled !== b.enabled) return false;
  if (a.name !== b.name) return false;
  if (a.description !== b.description) return false;
  if (a.createdAt !== b.createdAt) return false;
  if (a.updatedAt !== b.updatedAt) return false;
  
  // Filter comparison - both must exist or both must be null
  if (!a.filter && !b.filter) return true;
  if (!a.filter || !b.filter) return false;
  
  // Deep filter comparison
  if (a.filter.code !== b.filter.code) return false;
  if (a.filter.refreshInterval !== b.filter.refreshInterval) return false;
  
  // Compare description arrays
  const aDesc = a.filter.description || [];
  const bDesc = b.filter.description || [];
  if (aDesc.length !== bDesc.length) return false;
  if (!aDesc.every((desc, i) => desc === bDesc[i])) return false;
  
  // Compare required timeframes
  const aTf = a.filter.requiredTimeframes || [];
  const bTf = b.filter.requiredTimeframes || [];
  if (aTf.length !== bTf.length) return false;
  if (!aTf.every((tf, i) => tf === bTf[i])) return false;
  
  // Compare indicators if present
  const aInd = a.filter.indicators || [];
  const bInd = b.filter.indicators || [];
  if (aInd.length !== bInd.length) return false;
  
  // Deep compare each indicator
  for (let i = 0; i < aInd.length; i++) {
    const aIndicator = aInd[i];
    const bIndicator = bInd[i];
    
    if (aIndicator.type !== bIndicator.type) return false;
    if (aIndicator.displayName !== bIndicator.displayName) return false;
    if (JSON.stringify(aIndicator.params) !== JSON.stringify(bIndicator.params)) return false;
    if (aIndicator.outputKey !== bIndicator.outputKey) return false;
  }
  
  return true;
}

/**
 * Deep equality check for trader arrays
 * Order matters - traders must be in same position
 */
export function areTraderArraysEqual(a: Trader[], b: Trader[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((trader, index) => isTraderEqual(trader, b[index]));
}

/**
 * Find differences between two trader arrays
 * Returns indices of traders that have changed
 */
export function findTraderDifferences(oldTraders: Trader[], newTraders: Trader[]): {
  added: number[];
  removed: number[];
  modified: number[];
} {
  const added: number[] = [];
  const removed: number[] = [];
  const modified: number[] = [];
  
  const oldMap = new Map(oldTraders.map(t => [t.id, t]));
  const newMap = new Map(newTraders.map((t, i) => [t.id, { trader: t, index: i }]));
  
  // Find removed and modified
  oldTraders.forEach((oldTrader, i) => {
    const newEntry = newMap.get(oldTrader.id);
    if (!newEntry) {
      removed.push(i);
    } else if (!isTraderEqual(oldTrader, newEntry.trader)) {
      modified.push(newEntry.index);
    }
  });
  
  // Find added
  newTraders.forEach((newTrader, i) => {
    if (!oldMap.has(newTrader.id)) {
      added.push(i);
    }
  });
  
  return { added, removed, modified };
}