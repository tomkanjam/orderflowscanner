import { useState, useEffect, useRef, useCallback } from 'react';

interface DataFeedMetrics {
  updateFrequency: number; // updates per second
  lastUpdate: number | null; // timestamp instead of Date object
  totalUpdates: number;
}

/**
 * Hook to track data feed metrics like update frequency and last update time
 */
export const useDataFeedMetrics = () => {
  const [metrics, setMetrics] = useState<DataFeedMetrics>({
    updateFrequency: 0,
    lastUpdate: null,
    totalUpdates: 0
  });
  
  const updateCountRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout>();
  
  // Track an update - memoized to prevent recreating function
  const trackUpdate = useCallback(() => {
    updateCountRef.current++;
    const now = Date.now();
    setMetrics(prev => ({
      ...prev,
      lastUpdate: now,
      totalUpdates: prev.totalUpdates + 1
    }));
  }, []);
  
  // Calculate updates per second
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const updatesPerSecond = updateCountRef.current;
      updateCountRef.current = 0;
      
      // Only update if the frequency changed
      setMetrics(prev => {
        if (prev.updateFrequency !== updatesPerSecond) {
          return {
            ...prev,
            updateFrequency: updatesPerSecond
          };
        }
        return prev;
      });
    }, 1000);
    
    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
    };
  }, []);
  
  // Cleanup function to be called on component unmount
  useEffect(() => {
    return () => {
      // Clear any pending intervals
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
    };
  }, []);
  
  return {
    metrics,
    trackUpdate
  };
};