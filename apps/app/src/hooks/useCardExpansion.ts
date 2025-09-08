import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Hook for managing card expansion state with animation tracking
 * Supports multiple cards expanded simultaneously
 */
export interface UseCardExpansionReturn {
  expandedIds: Set<string>;
  animatingIds: Set<string>;
  toggleExpand: (id: string) => void;
  isExpanded: (id: string) => boolean;
  isAnimating: (id: string) => boolean;
  expandAll: () => void;
  collapseAll: () => void;
  expandCard: (id: string) => void;
  collapseCard: (id: string) => void;
}

export interface UseCardExpansionOptions {
  /** Duration of expand/collapse animation in ms */
  animationDuration?: number;
  /** Maximum number of cards that can be expanded (0 = unlimited) */
  maxExpanded?: number;
  /** Whether to persist expansion state in localStorage */
  persistState?: boolean;
  /** Storage key for persistence */
  storageKey?: string;
}

export function useCardExpansion(
  cardIds?: string[],
  options: UseCardExpansionOptions = {}
): UseCardExpansionReturn {
  const {
    animationDuration = 200,
    maxExpanded = 0,
    persistState = false,
    storageKey = 'card-expansion-state',
  } = options;

  // Initialize state from localStorage if persistence is enabled
  const getInitialState = (): Set<string> => {
    if (!persistState) return new Set();
    
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return new Set(Array.isArray(parsed) ? parsed : []);
      }
    } catch (error) {
      console.warn('Failed to load expansion state from localStorage:', error);
    }
    return new Set();
  };

  const [expandedIds, setExpandedIds] = useState<Set<string>>(getInitialState);
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
  const animationTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Persist state to localStorage when it changes
  useEffect(() => {
    if (!persistState) return;
    
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(expandedIds)));
    } catch (error) {
      console.warn('Failed to save expansion state to localStorage:', error);
    }
  }, [expandedIds, persistState, storageKey]);

  // Clear animation timeouts on unmount
  useEffect(() => {
    return () => {
      animationTimeouts.current.forEach(timeout => clearTimeout(timeout));
    };
  }, []);

  /**
   * Start animation for a card
   */
  const startAnimation = useCallback((id: string) => {
    // Clear existing timeout if any
    const existingTimeout = animationTimeouts.current.get(id);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Mark as animating
    setAnimatingIds(prev => new Set(prev).add(id));

    // Clear animation state after duration
    const timeout = setTimeout(() => {
      setAnimatingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      animationTimeouts.current.delete(id);
    }, animationDuration);

    animationTimeouts.current.set(id, timeout);
  }, [animationDuration]);

  /**
   * Expand a specific card
   */
  const expandCard = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      
      // Check max expanded limit
      if (maxExpanded > 0 && next.size >= maxExpanded && !next.has(id)) {
        // Remove the oldest expanded card
        const firstId = next.values().next().value;
        if (firstId) {
          next.delete(firstId);
          startAnimation(firstId);
        }
      }
      
      next.add(id);
      startAnimation(id);
      return next;
    });
  }, [maxExpanded, startAnimation]);

  /**
   * Collapse a specific card
   */
  const collapseCard = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      startAnimation(id);
      return next;
    });
  }, [startAnimation]);

  /**
   * Toggle expansion state of a card
   */
  const toggleExpand = useCallback((id: string) => {
    if (expandedIds.has(id)) {
      collapseCard(id);
    } else {
      expandCard(id);
    }
  }, [expandedIds, expandCard, collapseCard]);

  /**
   * Check if a card is expanded
   */
  const isExpanded = useCallback((id: string): boolean => {
    return expandedIds.has(id);
  }, [expandedIds]);

  /**
   * Check if a card is animating
   */
  const isAnimating = useCallback((id: string): boolean => {
    return animatingIds.has(id);
  }, [animatingIds]);

  /**
   * Expand all cards
   */
  const expandAll = useCallback(() => {
    if (!cardIds) return;
    
    const toExpand = maxExpanded > 0 ? cardIds.slice(0, maxExpanded) : cardIds;
    setExpandedIds(new Set(toExpand));
    
    // Animate all cards
    toExpand.forEach(id => startAnimation(id));
  }, [cardIds, maxExpanded, startAnimation]);

  /**
   * Collapse all cards
   */
  const collapseAll = useCallback(() => {
    // Animate all currently expanded cards
    expandedIds.forEach(id => startAnimation(id));
    setExpandedIds(new Set());
  }, [expandedIds, startAnimation]);

  return {
    expandedIds,
    animatingIds,
    toggleExpand,
    isExpanded,
    isAnimating,
    expandAll,
    collapseAll,
    expandCard,
    collapseCard,
  };
}