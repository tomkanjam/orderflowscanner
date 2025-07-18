import { useState, useEffect, useRef } from 'react';

interface DataFeedMetrics {
  updateFrequency: number; // updates per second
  lastUpdate: Date | null;
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
  
  // Track an update
  const trackUpdate = () => {
    updateCountRef.current++;
    setMetrics(prev => ({
      ...prev,
      lastUpdate: new Date(),
      totalUpdates: prev.totalUpdates + 1
    }));
  };
  
  // Calculate updates per second
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const updatesPerSecond = updateCountRef.current;
      updateCountRef.current = 0;
      
      setMetrics(prev => ({
        ...prev,
        updateFrequency: updatesPerSecond
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