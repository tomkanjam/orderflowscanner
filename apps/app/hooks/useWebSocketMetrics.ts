import { useState, useEffect, useRef, useCallback } from 'react';

interface WebSocketMetrics {
  updateFrequency: number; // updates per second
  lastUpdate: number | null; // timestamp
  totalUpdates: number;
  history: number[]; // 30-second rolling window of update frequencies
}

/**
 * Hook to track WebSocket data metrics with accurate update counting
 */
export const useWebSocketMetrics = () => {
  const [metrics, setMetrics] = useState<WebSocketMetrics>({
    updateFrequency: 0,
    lastUpdate: null,
    totalUpdates: 0,
    history: new Array(30).fill(0) // Initialize with 30 zeros
  });
  
  // Track updates without state changes for performance
  const updateCountRef = useRef(0);
  const lastUpdateRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout>();
  
  // Track an update - called for each WebSocket message
  const trackUpdate = useCallback(() => {
    updateCountRef.current++;
    lastUpdateRef.current = Date.now();
  }, []);
  
  // Calculate and update metrics every second
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const updatesThisSecond = updateCountRef.current;
      const lastUpdate = lastUpdateRef.current;
      
      // Reset counter for next second
      updateCountRef.current = 0;
      
      // Update state with new metrics and circular buffer
      setMetrics(prev => ({
        updateFrequency: updatesThisSecond,
        lastUpdate: lastUpdate,
        totalUpdates: prev.totalUpdates + updatesThisSecond,
        history: [...prev.history.slice(1), updatesThisSecond] // Circular buffer: remove first, add new
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