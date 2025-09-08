/**
 * Feature flag configuration for the application
 * Controls experimental or gradual rollout features
 */

export const FEATURES = {
  /**
   * Enable card expansion functionality
   * When true: Cards can expand/collapse to show additional details
   * When false: Cards remain in collapsed state only
   */
  ENABLE_CARD_EXPANSION: process.env.REACT_APP_ENABLE_CARD_EXPANSION === 'true',
  
  /**
   * Enable virtual scrolling for large card lists
   * Activates when more than 50 cards are displayed
   */
  ENABLE_VIRTUAL_SCROLLING: process.env.REACT_APP_ENABLE_VIRTUAL_SCROLLING === 'true',
} as const;

// Type-safe feature flag getter
export function isFeatureEnabled(feature: keyof typeof FEATURES): boolean {
  return FEATURES[feature] ?? false;
}

// Log active features in development
if (process.env.NODE_ENV === 'development') {
  console.log('Active feature flags:', 
    Object.entries(FEATURES)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name)
  );
}