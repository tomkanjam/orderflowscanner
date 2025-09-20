import React, { useState, useEffect, useRef, useCallback } from 'react';

interface PerformanceMonitorProps {
  metrics?: any;
}

const PerformanceMonitorComponent: React.FC<PerformanceMonitorProps> = ({ 
  metrics
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [fps, setFps] = useState(0);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [testDuration, setTestDuration] = useState(8); // hours
  const [memorySnapshots, setMemorySnapshots] = useState<Array<{time: string, memory: number}>>([]);
  const [memoryGrowth, setMemoryGrowth] = useState<number | null>(null);
  const testStartTime = useRef<number | null>(null);
  const snapshotInterval = useRef<NodeJS.Timeout | null>(null);
  
  // Monitor FPS
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let rafId: number;
    
    const measureFPS = () => {
      frameCount++;
      const currentTime = performance.now();
      
      if (currentTime >= lastTime + 1000) {
        setFps(Math.round((frameCount * 1000) / (currentTime - lastTime)));
        frameCount = 0;
        lastTime = currentTime;
      }
      
      rafId = requestAnimationFrame(measureFPS);
    };
    
    rafId = requestAnimationFrame(measureFPS);
    
    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);
  
  
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  const getMemoryUsage = useCallback(() => {
    if (performance && 'memory' in performance) {
      return Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024);
    }
    return 0;
  }, []);
  
  const startStressTest = useCallback(() => {
    console.log(`[PerformanceTest] Starting ${testDuration}-hour stress test...`);
    setIsTestRunning(true);
    setMemorySnapshots([]);
    setMemoryGrowth(null);
    testStartTime.current = Date.now();
    
    // Take initial snapshot
    const initialMemory = getMemoryUsage();
    setMemorySnapshots([{
      time: new Date().toLocaleTimeString(),
      memory: initialMemory
    }]);
    
    // Schedule periodic snapshots (every minute)
    snapshotInterval.current = setInterval(() => {
      const currentMemory = getMemoryUsage();
      const elapsed = Date.now() - (testStartTime.current || 0);
      const hoursElapsed = elapsed / (1000 * 60 * 60);
      
      setMemorySnapshots(prev => {
        const newSnapshots = [...prev, {
          time: new Date().toLocaleTimeString(),
          memory: currentMemory
        }].slice(-60); // Keep last 60 snapshots
        
        // Calculate growth rate
        if (prev.length > 0) {
          const firstSnapshot = prev[0];
          const growth = currentMemory - firstSnapshot.memory;
          const growthPerHour = hoursElapsed > 0 ? growth / hoursElapsed : 0;
          setMemoryGrowth(growthPerHour);
        }
        
        return newSnapshots;
      });
      
      // Auto-stop after test duration
      if (hoursElapsed >= testDuration) {
        stopStressTest();
      }
    }, 60000); // Every minute
  }, [testDuration, getMemoryUsage]);
  
  const stopStressTest = useCallback(() => {
    console.log('[PerformanceTest] Stopping stress test...');
    setIsTestRunning(false);
    
    if (snapshotInterval.current) {
      clearInterval(snapshotInterval.current);
      snapshotInterval.current = null;
    }
    
    // Calculate final results
    if (memorySnapshots.length > 1) {
      const firstSnapshot = memorySnapshots[0];
      const lastSnapshot = memorySnapshots[memorySnapshots.length - 1];
      const totalGrowth = lastSnapshot.memory - firstSnapshot.memory;
      const elapsed = Date.now() - (testStartTime.current || 0);
      const hoursElapsed = elapsed / (1000 * 60 * 60);
      const growthPerHour = hoursElapsed > 0 ? totalGrowth / hoursElapsed : 0;
      
      console.log('[PerformanceTest] Results:');
      console.log(`  Duration: ${hoursElapsed.toFixed(2)} hours`);
      console.log(`  Memory Growth: ${totalGrowth.toFixed(2)} MB`);
      console.log(`  Growth Rate: ${growthPerHour.toFixed(2)} MB/hour`);
      console.log(`  Status: ${growthPerHour <= 50 ? '✅ PASSED' : '❌ FAILED'} (target: <50 MB/hour)`);
    }
  }, [memorySnapshots]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (snapshotInterval.current) {
        clearInterval(snapshotInterval.current);
      }
    };
  }, []);
  
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-[var(--tm-bg-secondary)] rounded-lg shadow-lg border border-[var(--tm-border)] overflow-hidden">
        {/* Header */}
        <div 
          className="px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-[var(--tm-bg-tertiary)]"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center space-x-3">
            <span className="text-xs text-[var(--tm-text-muted)]">Performance</span>
            <span className="text-xs font-mono text-green-500">
              🚀 Shared Memory
            </span>
            <span className={`text-xs font-mono ${fps < 30 ? 'text-red-500' : fps < 50 ? 'text-yellow-500' : 'text-green-500'}`}>
              {fps} FPS
            </span>
          </div>
          <svg 
            className={`w-4 h-4 text-[var(--tm-text-muted)] transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        
        {/* Expanded Content */}
        {isExpanded && (
          <div className="px-4 py-3 border-t border-[var(--tm-border)]">
            {/* Metrics Display */}
            {metrics && (
              <div className="space-y-2">
                {/* Comparison metrics for shared mode */}
                {metrics.oldApproach && metrics.newApproach && (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-[var(--tm-text-muted)]">Serialization</div>
                        <div className="font-mono">
                          <span className="text-red-500 line-through">{metrics.oldApproach.serializationMs}ms</span>
                          {' → '}
                          <span className="text-green-500">{metrics.newApproach.serializationMs}ms</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-[var(--tm-text-muted)]">Data Transfer</div>
                        <div className="font-mono">
                          <span className="text-red-500 line-through">{metrics.oldApproach.dataTransferMB}MB</span>
                          {' → '}
                          <span className="text-green-500">{metrics.newApproach.dataTransferMB}MB</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-xs">
                      <div className="text-[var(--tm-text-muted)]">Improvement</div>
                      <div className="font-mono text-green-500 text-lg">{metrics.improvementPercent}</div>
                    </div>
                  </>
                )}
                
                {/* Batched mode metrics */}
                {metrics.serializationsPerMinute !== undefined && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-[var(--tm-text-muted)]">Serializations/min</div>
                      <div className="font-mono text-[var(--tm-text-primary)]">{metrics.serializationsPerMinute}</div>
                    </div>
                    <div>
                      <div className="text-[var(--tm-text-muted)]">Improvement</div>
                      <div className="font-mono text-green-500">{metrics.improvementPercent}</div>
                    </div>
                  </div>
                )}
                
                {/* Memory usage */}
                {metrics.memoryUsageMB !== undefined && (
                  <div className="text-xs">
                    <div className="text-[var(--tm-text-muted)]">Memory Usage</div>
                    <div className="font-mono text-[var(--tm-text-primary)]">{metrics.memoryUsageMB} MB</div>
                  </div>
                )}
                
                {/* Update count */}
                {metrics.updateCount !== undefined && (
                  <div className="text-xs">
                    <div className="text-[var(--tm-text-muted)]">Updates Processed</div>
                    <div className="font-mono text-[var(--tm-text-primary)]">{metrics.updateCount.toLocaleString()}</div>
                  </div>
                )}
              </div>
            )}
            
            {/* Stress Test Section */}
            <div className="mt-3 pt-3 border-t border-[var(--tm-border)]">
              <div className="text-xs">
                <div className="flex items-center justify-between mb-2">
                  <strong className="text-[var(--tm-text-primary)]">Stress Test</strong>
                  {isTestRunning && (
                    <span className="text-green-500 animate-pulse">● Running</span>
                  )}
                </div>
                
                {!isTestRunning ? (
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <label className="text-[var(--tm-text-muted)]">Duration:</label>
                      <select 
                        value={testDuration} 
                        onChange={(e) => setTestDuration(Number(e.target.value))}
                        className="bg-[var(--tm-bg-primary)] text-[var(--tm-text-primary)] px-2 py-1 rounded text-xs border border-[var(--tm-border)]"
                      >
                        <option value={0.0167}>1 min (test)</option>
                        <option value={0.5}>30 min</option>
                        <option value={1}>1 hour</option>
                        <option value={4}>4 hours</option>
                        <option value={8}>8 hours</option>
                      </select>
                    </div>
                    <button
                      onClick={startStressTest}
                      className="w-full bg-green-500/20 text-green-500 hover:bg-green-500/30 px-3 py-1 rounded text-xs font-medium transition-colors"
                    >
                      Start Test
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-[var(--tm-text-muted)]">Memory:</span>
                      <span className="font-mono text-[var(--tm-text-primary)]">
                        {memorySnapshots.length > 0 ? `${memorySnapshots[memorySnapshots.length - 1].memory} MB` : '...'}
                      </span>
                    </div>
                    {memoryGrowth !== null && (
                      <div className="flex justify-between">
                        <span className="text-[var(--tm-text-muted)]">Growth Rate:</span>
                        <span className={`font-mono ${memoryGrowth <= 50 ? 'text-green-500' : 'text-red-500'}`}>
                          {memoryGrowth.toFixed(2)} MB/hr
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-[var(--tm-text-muted)]">Snapshots:</span>
                      <span className="font-mono text-[var(--tm-text-primary)]">{memorySnapshots.length}</span>
                    </div>
                    <button
                      onClick={stopStressTest}
                      className="w-full bg-red-500/20 text-red-500 hover:bg-red-500/30 px-3 py-1 rounded text-xs font-medium transition-colors"
                    >
                      Stop Test
                    </button>
                  </div>
                )}
                
                {/* Show last few snapshots */}
                {memorySnapshots.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-[var(--tm-border)]">
                    <div className="text-[10px] text-[var(--tm-text-muted)]">
                      Recent Snapshots:
                      <div className="mt-1 space-y-0.5 max-h-20 overflow-y-auto">
                        {memorySnapshots.slice(-5).map((snapshot, i) => (
                          <div key={i} className="flex justify-between font-mono">
                            <span>{snapshot.time}</span>
                            <span>{snapshot.memory} MB</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Mode Description */}
            <div className="mt-3 pt-3 border-t border-[var(--tm-border)]">
              <div className="text-xs text-[var(--tm-text-muted)]">
                <div>
                  <strong className="text-green-500">Zero-Copy Architecture:</strong>
                  <ul className="mt-1 space-y-1 text-[10px]">
                    <li>• SharedArrayBuffer for zero serialization</li>
                    <li>• Persistent worker state</li>
                    <li>• Atomic operations for synchronization</li>
                    <li>• No main thread blocking</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Memoize component with deep comparison of metrics
export const PerformanceMonitor = React.memo(PerformanceMonitorComponent, (prevProps, nextProps) => {
  // Deep comparison of metrics object for equality
  return JSON.stringify(prevProps.metrics) === JSON.stringify(nextProps.metrics);
});