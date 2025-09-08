/**
 * Memory Debugger - Targeted logging to identify memory leaks
 */

interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  label: string;
  details?: Record<string, any>;
}

class MemoryDebugger {
  private snapshots: MemorySnapshot[] = [];
  private dataStructureSizes: Map<string, number> = new Map();
  private startTime = Date.now();
  
  takeSnapshot(label: string, details?: Record<string, any>) {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      const snapshot: MemorySnapshot = {
        timestamp: Date.now() - this.startTime,
        heapUsed: memory.usedJSHeapSize,
        label,
        details
      };
      
      this.snapshots.push(snapshot);
      
      // Keep only last 100 snapshots
      if (this.snapshots.length > 100) {
        this.snapshots.shift();
      }
      
      console.log(`[MemDebug] ${label}: ${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`, details);
    }
  }
  
  trackDataStructure(name: string, data: any) {
    let size = 0;
    
    if (data instanceof Map) {
      size = data.size;
      // Estimate memory for Map
      if (name === 'historicalData') {
        // Count total klines
        let totalKlines = 0;
        data.forEach((intervalMap: Map<string, any[]>) => {
          intervalMap.forEach((klines: any[]) => {
            totalKlines += klines.length;
          });
        });
        size = totalKlines;
      }
    } else if (Array.isArray(data)) {
      size = data.length;
    } else if (data && typeof data === 'object') {
      size = Object.keys(data).length;
    }
    
    const previousSize = this.dataStructureSizes.get(name) || 0;
    this.dataStructureSizes.set(name, size);
    
    // Log if size increased significantly
    if (size > previousSize * 1.1 || size > previousSize + 1000) {
      console.log(`[MemDebug] ${name} grew: ${previousSize} → ${size} (+${size - previousSize})`);
    }
  }
  
  getGrowthRate() {
    if (this.snapshots.length < 2) return 0;
    
    const recent = this.snapshots.slice(-10);
    const first = recent[0];
    const last = recent[recent.length - 1];
    
    const memoryDiff = last.heapUsed - first.heapUsed;
    const timeDiff = (last.timestamp - first.timestamp) / 1000; // in seconds
    
    const growthRate = memoryDiff / timeDiff; // bytes per second
    
    if (growthRate > 1024 * 1024) { // More than 1 MB/s
      console.warn(`[MemDebug] HIGH MEMORY GROWTH: ${(growthRate / 1024 / 1024).toFixed(2)} MB/s`);
    }
    
    return growthRate;
  }
  
  analyze() {
    console.log('[MemDebug] === Memory Analysis ===');
    console.log('Data structures:', Object.fromEntries(this.dataStructureSizes));
    
    if (this.snapshots.length > 1) {
      const first = this.snapshots[0];
      const last = this.snapshots[this.snapshots.length - 1];
      const totalGrowth = (last.heapUsed - first.heapUsed) / 1024 / 1024;
      const timeElapsed = (last.timestamp - first.timestamp) / 1000;
      
      console.log(`Total growth: ${totalGrowth.toFixed(2)} MB over ${timeElapsed.toFixed(1)}s`);
      console.log(`Growth rate: ${(totalGrowth / timeElapsed * 60).toFixed(2)} MB/min`);
    }
    
    // Find biggest jumps
    let biggestJump = 0;
    let biggestJumpLabel = '';
    
    for (let i = 1; i < this.snapshots.length; i++) {
      const jump = this.snapshots[i].heapUsed - this.snapshots[i - 1].heapUsed;
      if (jump > biggestJump) {
        biggestJump = jump;
        biggestJumpLabel = this.snapshots[i].label;
      }
    }
    
    if (biggestJump > 0) {
      console.log(`Biggest jump: ${(biggestJump / 1024 / 1024).toFixed(2)} MB at "${biggestJumpLabel}"`);
    }
  }
  
  reset() {
    this.snapshots = [];
    this.dataStructureSizes.clear();
    this.startTime = Date.now();
    console.log('[MemDebug] Reset memory tracking');
  }
}

export const memDebug = new MemoryDebugger();

// Auto-analyze every 30 seconds
if (typeof window !== 'undefined') {
  setInterval(() => {
    memDebug.getGrowthRate();
  }, 30000);
  
  // Expose to window for debugging
  (window as any).memDebug = memDebug;
}