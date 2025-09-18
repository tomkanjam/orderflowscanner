/**
 * MemoryManager - Central service for memory lifecycle management
 * Tracks and manages all resources to prevent memory leaks
 */

import { 
  ManagedResource, 
  MemoryConfig, 
  MemoryStats, 
  DEFAULT_MEMORY_CONFIG 
} from './types';

export class MemoryManager {
  private static instance: MemoryManager | null = null;
  private resources: Map<string, ManagedResource> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private config: MemoryConfig;
  private startTime: number = Date.now();
  private lastCleanupTime: number = Date.now();
  private resourceIdCounter: number = 0;

  private constructor(config: Partial<MemoryConfig> = {}) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
    
    if (typeof window !== 'undefined' && 'performance' in window) {
      // Monitor memory pressure in browser environment
      this.monitorMemoryPressure();
    }
  }

  static getInstance(config?: Partial<MemoryConfig>): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager(config);
    }
    return MemoryManager.instance;
  }

  /**
   * Register a resource for tracking
   */
  register(resource: Omit<ManagedResource, 'resourceId'>): string {
    const resourceId = `resource_${++this.resourceIdCounter}_${Date.now()}`;
    const managedResource: ManagedResource = {
      ...resource,
      resourceId,
      createdAt: Date.now()
    };
    
    this.resources.set(resourceId, managedResource);
    
    // Log resource creation in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[MemoryManager] Registered ${resource.type}: ${resourceId} (${resource.description || 'no description'})`);
    }
    
    return resourceId;
  }

  /**
   * Cleanup a specific resource
   */
  cleanup(resourceId: string): boolean {
    const resource = this.resources.get(resourceId);
    if (!resource) {
      return false;
    }

    try {
      resource.cleanup();
      this.resources.delete(resourceId);
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[MemoryManager] Cleaned up ${resource.type}: ${resourceId}`);
      }
      
      return true;
    } catch (error) {
      console.error(`[MemoryManager] Error cleaning up resource ${resourceId}:`, error);
      // Still remove from tracking even if cleanup fails
      this.resources.delete(resourceId);
      return false;
    }
  }

  /**
   * Cleanup all resources of a specific type
   */
  cleanupByType(type: ManagedResource['type']): number {
    let cleanedCount = 0;
    const resourcesToClean: string[] = [];
    
    // Collect resources to clean (avoid modifying map while iterating)
    this.resources.forEach((resource, id) => {
      if (resource.type === type) {
        resourcesToClean.push(id);
      }
    });
    
    // Clean up collected resources
    resourcesToClean.forEach(id => {
      if (this.cleanup(id)) {
        cleanedCount++;
      }
    });
    
    console.log(`[MemoryManager] Cleaned up ${cleanedCount} resources of type ${type}`);
    return cleanedCount;
  }

  /**
   * Cleanup resources owned by a specific owner
   */
  cleanupByOwner(owner: string): number {
    let cleanedCount = 0;
    const resourcesToClean: string[] = [];
    
    this.resources.forEach((resource, id) => {
      if (resource.owner === owner) {
        resourcesToClean.push(id);
      }
    });
    
    resourcesToClean.forEach(id => {
      if (this.cleanup(id)) {
        cleanedCount++;
      }
    });
    
    return cleanedCount;
  }

  /**
   * Start automatic cleanup based on age
   */
  startAutomaticCleanup(intervalMs?: number): void {
    const interval = intervalMs || this.config.cleanupIntervalMs;
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cleanupInterval = setInterval(() => {
      this.performAgeBasedCleanup();
    }, interval);
    
    console.log(`[MemoryManager] Started automatic cleanup every ${interval}ms`);
  }

  /**
   * Stop automatic cleanup
   */
  stopAutomaticCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Perform cleanup of old resources
   */
  private performAgeBasedCleanup(): void {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour default max age
    const resourcesToClean: string[] = [];
    
    this.resources.forEach((resource, id) => {
      const age = now - resource.createdAt;
      
      // Clean up old resources without owners
      if (!resource.owner && age > maxAge) {
        resourcesToClean.push(id);
      }
      
      // Clean up very old resources regardless of owner
      if (age > maxAge * 24) { // 24 hours
        resourcesToClean.push(id);
      }
    });
    
    let cleanedCount = 0;
    resourcesToClean.forEach(id => {
      if (this.cleanup(id)) {
        cleanedCount++;
      }
    });
    
    if (cleanedCount > 0) {
      console.log(`[MemoryManager] Age-based cleanup removed ${cleanedCount} old resources`);
    }
    
    this.lastCleanupTime = now;
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): MemoryStats {
    let heapUsed = 0;
    let heapTotal = 0;
    let external = 0;
    
    // Get memory info if available
    if (typeof window !== 'undefined' && 'performance' in window) {
      const perfMemory = (performance as any).memory;
      if (perfMemory) {
        heapUsed = perfMemory.usedJSHeapSize;
        heapTotal = perfMemory.totalJSHeapSize;
        external = perfMemory.jsHeapSizeLimit;
      }
    } else if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      heapUsed = usage.heapUsed;
      heapTotal = usage.heapTotal;
      external = usage.external;
    }
    
    return {
      heapUsed,
      heapTotal,
      external,
      resourceCount: this.resources.size,
      symbolCount: 0, // Will be populated by app
      signalCount: 0, // Will be populated by app
      lastCleanup: this.lastCleanupTime,
      uptime: Date.now() - this.startTime
    };
  }

  /**
   * Perform emergency cleanup when memory pressure detected
   */
  performEmergencyCleanup(): void {
    console.warn('[MemoryManager] Performing emergency cleanup due to memory pressure');
    
    // Clean up in order of priority
    this.cleanupByType('timeout');
    this.cleanupByType('interval');
    this.cleanupByType('listener');
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    const stats = this.getMemoryStats();
    console.log('[MemoryManager] Emergency cleanup complete. Heap used:', 
      (stats.heapUsed / 1024 / 1024).toFixed(2), 'MB');
  }

  /**
   * Monitor memory pressure and trigger emergency cleanup
   */
  private monitorMemoryPressure(): void {
    setInterval(() => {
      const stats = this.getMemoryStats();
      const heapUsedMb = stats.heapUsed / 1024 / 1024;
      
      if (heapUsedMb > this.config.emergencyThresholdMb) {
        console.warn(`[MemoryManager] Memory pressure detected: ${heapUsedMb.toFixed(2)}MB used`);
        this.performEmergencyCleanup();
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Clean up all resources and reset
   */
  dispose(): void {
    console.log('[MemoryManager] Disposing all resources');
    
    // Stop automatic cleanup
    this.stopAutomaticCleanup();
    
    // Clean up all resources
    const resourceIds = Array.from(this.resources.keys());
    resourceIds.forEach(id => this.cleanup(id));
    
    // Clear the map
    this.resources.clear();
    
    // Reset instance
    MemoryManager.instance = null;
  }

  /**
   * Get resource count by type
   */
  getResourceCountByType(): Record<string, number> {
    const counts: Record<string, number> = {};
    
    this.resources.forEach(resource => {
      counts[resource.type] = (counts[resource.type] || 0) + 1;
    });
    
    return counts;
  }

  /**
   * Find potential memory leaks (resources that are very old)
   */
  findPotentialLeaks(ageThresholdMs: number = 60 * 60 * 1000): ManagedResource[] {
    const now = Date.now();
    const leaks: ManagedResource[] = [];
    
    this.resources.forEach(resource => {
      if (now - resource.createdAt > ageThresholdMs) {
        leaks.push(resource);
      }
    });
    
    return leaks;
  }
}