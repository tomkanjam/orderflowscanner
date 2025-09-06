import React, { useState, useEffect } from 'react';

interface PerformanceMonitorProps {
  metrics?: any;
  mode: string;
  onModeChange: (mode: string) => void;
}

export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({ 
  metrics, 
  mode, 
  onModeChange 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [fps, setFps] = useState(0);
  
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
  
  const getModeLabel = (mode: string) => {
    switch (mode) {
      case 'shared':
        return '🚀 Shared Memory (Zero-Copy)';
      case 'batched':
        return '⚡ Batched Execution';
      case 'individual':
        return '🐌 Individual (Legacy)';
      default:
        return mode;
    }
  };
  
  const getModeColor = (mode: string) => {
    switch (mode) {
      case 'shared':
        return 'text-green-500';
      case 'batched':
        return 'text-yellow-500';
      case 'individual':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };
  
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
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
            <span className={`text-xs font-mono ${getModeColor(mode)}`}>
              {getModeLabel(mode)}
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
            {/* Mode Selector */}
            <div className="mb-3">
              <label className="text-xs text-[var(--tm-text-muted)] mb-1 block">Optimization Mode</label>
              <select 
                value={mode}
                onChange={(e) => onModeChange(e.target.value)}
                className="w-full px-2 py-1 text-xs bg-[var(--tm-bg-primary)] border border-[var(--tm-border)] rounded text-[var(--tm-text-primary)]"
              >
                <option value="shared">🚀 Shared Memory (Best)</option>
                <option value="batched">⚡ Batched (Good)</option>
                <option value="individual">🐌 Individual (Legacy)</option>
              </select>
            </div>
            
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
            
            {/* Mode Description */}
            <div className="mt-3 pt-3 border-t border-[var(--tm-border)]">
              <div className="text-xs text-[var(--tm-text-muted)]">
                {mode === 'shared' && (
                  <div>
                    <strong className="text-green-500">Zero-Copy Architecture:</strong>
                    <ul className="mt-1 space-y-1 text-[10px]">
                      <li>• SharedArrayBuffer for zero serialization</li>
                      <li>• Persistent worker state</li>
                      <li>• Atomic operations for synchronization</li>
                      <li>• No main thread blocking</li>
                    </ul>
                  </div>
                )}
                {mode === 'batched' && (
                  <div>
                    <strong className="text-yellow-500">Batched Execution:</strong>
                    <ul className="mt-1 space-y-1 text-[10px]">
                      <li>• Groups traders by interval</li>
                      <li>• Single serialization per group</li>
                      <li>• 80% reduction in overhead</li>
                      <li>• Good compatibility</li>
                    </ul>
                  </div>
                )}
                {mode === 'individual' && (
                  <div>
                    <strong className="text-red-500">Legacy Mode:</strong>
                    <ul className="mt-1 space-y-1 text-[10px]">
                      <li>• Each trader runs independently</li>
                      <li>• Full data serialization per trader</li>
                      <li>• High main thread blocking</li>
                      <li>• Use only for debugging</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};