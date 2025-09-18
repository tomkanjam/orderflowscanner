/**
 * Memory Management Type Definitions
 * Provides interfaces for resource lifecycle and memory tracking
 */

export interface CollectionMetadata {
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
}

export interface ManagedResource {
  resourceId: string;
  type: 'interval' | 'listener' | 'websocket' | 'worker' | 'timeout' | 'generic';
  cleanup: () => void;
  createdAt: number;
  owner?: string;
  description?: string;
}

export interface MemoryConfig {
  maxSymbols: number;
  maxSignalHistory: number;
  maxWorkerCache: number;
  maxTickerBatch: number;
  cleanupIntervalMs: number;
  emergencyThresholdMb: number;
}

export interface CleanupPolicy {
  signals: {
    maxAge: number; // milliseconds
    maxCount: number;
  };
  tickers: {
    maxInactive: number; // milliseconds
    maxCount: number;
  };
  workers: {
    maxIdle: number; // milliseconds
    maxResults: number;
  };
}

export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  external: number;
  resourceCount: number;
  symbolCount: number;
  signalCount: number;
  lastCleanup: number;
  uptime: number;
}

export interface OptimizedSignalHistory {
  timestamp: number;
  traderId: string;
  traderName: string;
  symbols: string[]; // Just symbol names, not full data
  expiresAt: number; // TTL for automatic cleanup
}

export interface TickerUpdateBatch {
  timestamp: number;
  updates: Map<string, any>;
  processed: boolean;
}

export interface WorkerMemoryConfig {
  maxCacheSize: number;
  maxResultAge: number; // milliseconds
  cleanupInterval: number;
  maxIntervals: number;
}

export interface BufferCleanupTracker {
  lastCleanup: number;
  dirtyFlags: Set<number>;
  pendingCleanups: number[];
}

// Default configuration values
export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  maxSymbols: 500,
  maxSignalHistory: 1000,
  maxWorkerCache: 100,
  maxTickerBatch: 100,
  cleanupIntervalMs: 30000, // 30 seconds
  emergencyThresholdMb: 500
};

export const DEFAULT_CLEANUP_POLICY: CleanupPolicy = {
  signals: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    maxCount: 1000
  },
  tickers: {
    maxInactive: 5 * 60 * 1000, // 5 minutes
    maxCount: 500
  },
  workers: {
    maxIdle: 10 * 60 * 1000, // 10 minutes
    maxResults: 100
  }
};