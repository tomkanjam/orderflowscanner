/**
 * ResourceTracker - Centralized resource registry with lifecycle management
 * Detects orphaned resources and schedules cleanup
 */

import { MemoryManager } from './MemoryManager';
import { ManagedResource } from './types';

interface TrackedResource {
  id: string;
  type: ManagedResource['type'];
  owner?: string;
  createdAt: number;
  lastActivity: number;
  isOrphaned: boolean;
}

export class ResourceTracker {
  private static instance: ResourceTracker | null = null;
  private memoryManager: MemoryManager;
  private trackedResources: Map<string, TrackedResource> = new Map();
  private orphanCheckInterval: NodeJS.Timeout | null = null;
  private cleanupScheduler: NodeJS.Timeout | null = null;
  
  // Configuration
  private readonly ORPHAN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private readonly ORPHAN_CHECK_INTERVAL_MS = 60 * 1000; // 1 minute
  private readonly CLEANUP_SCHEDULE_MS = 30 * 1000; // 30 seconds

  private constructor() {
    this.memoryManager = MemoryManager.getInstance();
    this.startOrphanDetection();
    this.startCleanupScheduler();
  }

  static getInstance(): ResourceTracker {
    if (!ResourceTracker.instance) {
      ResourceTracker.instance = new ResourceTracker();
    }
    return ResourceTracker.instance;
  }

  /**
   * Register an interval for tracking
   */
  registerInterval(
    intervalId: NodeJS.Timeout,
    owner?: string,
    description?: string
  ): string {
    const resourceId = this.memoryManager.register({
      type: 'interval',
      cleanup: () => clearInterval(intervalId),
      createdAt: Date.now(),
      owner,
      description
    });

    this.trackedResources.set(resourceId, {
      id: resourceId,
      type: 'interval',
      owner,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      isOrphaned: false
    });

    return resourceId;
  }

  /**
   * Register a timeout for tracking
   */
  registerTimeout(
    timeoutId: NodeJS.Timeout,
    owner?: string,
    description?: string
  ): string {
    const resourceId = this.memoryManager.register({
      type: 'timeout',
      cleanup: () => clearTimeout(timeoutId),
      createdAt: Date.now(),
      owner,
      description
    });

    this.trackedResources.set(resourceId, {
      id: resourceId,
      type: 'timeout',
      owner,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      isOrphaned: false
    });

    return resourceId;
  }

  /**
   * Register an event listener for tracking
   */
  registerListener(
    target: EventTarget,
    event: string,
    handler: EventListener,
    owner?: string
  ): string {
    const resourceId = this.memoryManager.register({
      type: 'listener',
      cleanup: () => target.removeEventListener(event, handler),
      createdAt: Date.now(),
      owner,
      description: `${event} listener`
    });

    this.trackedResources.set(resourceId, {
      id: resourceId,
      type: 'listener',
      owner,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      isOrphaned: false
    });

    return resourceId;
  }

  /**
   * Register a worker for tracking
   */
  registerWorker(
    worker: Worker,
    owner?: string,
    description?: string
  ): string {
    const resourceId = this.memoryManager.register({
      type: 'worker',
      cleanup: () => worker.terminate(),
      createdAt: Date.now(),
      owner,
      description
    });

    this.trackedResources.set(resourceId, {
      id: resourceId,
      type: 'worker',
      owner,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      isOrphaned: false
    });

    return resourceId;
  }

  /**
   * Register a WebSocket connection for tracking
   */
  registerWebSocket(
    socket: WebSocket,
    owner?: string,
    description?: string
  ): string {
    const resourceId = this.memoryManager.register({
      type: 'websocket',
      cleanup: () => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      },
      createdAt: Date.now(),
      owner,
      description
    });

    this.trackedResources.set(resourceId, {
      id: resourceId,
      type: 'websocket',
      owner,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      isOrphaned: false
    });

    return resourceId;
  }

  /**
   * Register a generic resource with custom cleanup
   */
  registerGeneric(
    cleanup: () => void,
    owner?: string,
    description?: string
  ): string {
    const resourceId = this.memoryManager.register({
      type: 'generic',
      cleanup,
      createdAt: Date.now(),
      owner,
      description
    });

    this.trackedResources.set(resourceId, {
      id: resourceId,
      type: 'generic',
      owner,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      isOrphaned: false
    });

    return resourceId;
  }

  /**
   * Update activity timestamp for a resource
   */
  updateActivity(resourceId: string): void {
    const resource = this.trackedResources.get(resourceId);
    if (resource) {
      resource.lastActivity = Date.now();
      resource.isOrphaned = false;
    }
  }

  /**
   * Release a resource
   */
  release(resourceId: string): boolean {
    const success = this.memoryManager.cleanup(resourceId);
    if (success) {
      this.trackedResources.delete(resourceId);
    }
    return success;
  }

  /**
   * Release all resources owned by a specific owner
   */
  releaseByOwner(owner: string): number {
    const resourceIds: string[] = [];
    
    this.trackedResources.forEach((resource, id) => {
      if (resource.owner === owner) {
        resourceIds.push(id);
      }
    });

    let releasedCount = 0;
    resourceIds.forEach(id => {
      if (this.release(id)) {
        releasedCount++;
      }
    });

    return releasedCount;
  }

  /**
   * Start orphan detection
   */
  private startOrphanDetection(): void {
    if (this.orphanCheckInterval) {
      clearInterval(this.orphanCheckInterval);
    }

    this.orphanCheckInterval = setInterval(() => {
      this.detectOrphans();
    }, this.ORPHAN_CHECK_INTERVAL_MS);

    console.log('[ResourceTracker] Started orphan detection');
  }

  /**
   * Detect orphaned resources
   */
  private detectOrphans(): void {
    const now = Date.now();
    let orphanCount = 0;

    this.trackedResources.forEach(resource => {
      const inactiveTime = now - resource.lastActivity;
      
      // Mark as orphaned if inactive and no owner
      if (!resource.owner && inactiveTime > this.ORPHAN_TIMEOUT_MS) {
        if (!resource.isOrphaned) {
          resource.isOrphaned = true;
          orphanCount++;
          console.warn(`[ResourceTracker] Detected orphan ${resource.type}: ${resource.id}`);
        }
      }
    });

    if (orphanCount > 0) {
      console.log(`[ResourceTracker] Found ${orphanCount} new orphaned resources`);
    }
  }

  /**
   * Start cleanup scheduler
   */
  private startCleanupScheduler(): void {
    if (this.cleanupScheduler) {
      clearInterval(this.cleanupScheduler);
    }

    this.cleanupScheduler = setInterval(() => {
      this.performScheduledCleanup();
    }, this.CLEANUP_SCHEDULE_MS);

    console.log('[ResourceTracker] Started cleanup scheduler');
  }

  /**
   * Perform scheduled cleanup
   */
  private performScheduledCleanup(): void {
    const resourcesToClean: string[] = [];
    const now = Date.now();

    this.trackedResources.forEach((resource, id) => {
      // Clean up orphaned resources
      if (resource.isOrphaned) {
        resourcesToClean.push(id);
      }
      
      // Clean up very old resources
      const age = now - resource.createdAt;
      if (age > 24 * 60 * 60 * 1000) { // 24 hours
        resourcesToClean.push(id);
      }
    });

    if (resourcesToClean.length > 0) {
      console.log(`[ResourceTracker] Cleaning up ${resourcesToClean.length} resources`);
      resourcesToClean.forEach(id => this.release(id));
    }
  }

  /**
   * Get statistics about tracked resources
   */
  getStats(): {
    total: number;
    byType: Record<string, number>;
    orphaned: number;
    withOwner: number;
    oldestAge: number;
  } {
    const byType: Record<string, number> = {};
    let orphaned = 0;
    let withOwner = 0;
    let oldestAge = 0;
    const now = Date.now();

    this.trackedResources.forEach(resource => {
      byType[resource.type] = (byType[resource.type] || 0) + 1;
      
      if (resource.isOrphaned) orphaned++;
      if (resource.owner) withOwner++;
      
      const age = now - resource.createdAt;
      oldestAge = Math.max(oldestAge, age);
    });

    return {
      total: this.trackedResources.size,
      byType,
      orphaned,
      withOwner,
      oldestAge
    };
  }

  /**
   * Dispose of the resource tracker
   */
  dispose(): void {
    // Stop intervals
    if (this.orphanCheckInterval) {
      clearInterval(this.orphanCheckInterval);
      this.orphanCheckInterval = null;
    }

    if (this.cleanupScheduler) {
      clearInterval(this.cleanupScheduler);
      this.cleanupScheduler = null;
    }

    // Release all tracked resources
    const resourceIds = Array.from(this.trackedResources.keys());
    resourceIds.forEach(id => this.release(id));

    // Clear tracking
    this.trackedResources.clear();

    // Reset instance
    ResourceTracker.instance = null;

    console.log('[ResourceTracker] Disposed');
  }
}