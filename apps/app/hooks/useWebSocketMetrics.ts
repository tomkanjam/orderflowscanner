import { useState, useEffect, useRef, useCallback } from 'react';

interface WebSocketMetrics {
  updateFrequency: number; // updates per second
  lastUpdate: number | null; // timestamp
  totalUpdates: number;
}

/**
 * Hook to track WebSocket data metrics with accurate update counting
 */
export const useWebSocketMetrics = () => {
  const [metrics, setMetrics] = useState<WebSocketMetrics>({
    updateFrequency: 0,
    lastUpdate: null,
    totalUpdates: 0
  });
  
  // Track updates without state changes for performance
  const updateCountRef = useRef(0);
  const lastUpdateRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout>();
  
  // Track an update - called for each WebSocket message
  const trackUpdate = useCallback(() => {
    updateCountRef.current++;
    lastUpdateRef.current = Date.now();
    if (updateCountRef.current === 1) {
      console.log('[StatusBar Debug] First update tracked');
    }
  }, []);
  
  // Calculate and update metrics every second
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const updatesThisSecond = updateCountRef.current;
      const lastUpdate = lastUpdateRef.current;
      
      if (updatesThisSecond > 0) {
        console.log('[StatusBar Debug] Updates this second:', updatesThisSecond);
      }
      
      // Reset counter for next second
      updateCountRef.current = 0;
      
      // Update state with new metrics
      setMetrics(prev => ({
        updateFrequency: updatesThisSecond,
        lastUpdate: lastUpdate,
        totalUpdates: prev.totalUpdates + updatesThisSecond
      }));
    }, 1000);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);
  
  return {
    metrics,
    trackUpdate
  };
};