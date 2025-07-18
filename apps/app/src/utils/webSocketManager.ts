/**
 * WebSocket connection manager to prevent memory leaks from multiple connections
 */

import { DEBUG_MODE } from '../../constants';

interface WebSocketConfig {
  url: string;
  onOpen: () => void;
  onMessage: (event: MessageEvent) => void;
  onError: (error: Event) => void;
  onClose: () => void;
}

interface ManagedWebSocket {
  ws: WebSocket;
  config: WebSocketConfig;
  connectionId: string;
  createdAt: number;
}

class WebSocketManager {
  private connections = new Map<string, ManagedWebSocket>();
  private reconnectTimeouts = new Map<string, NodeJS.Timeout>();
  private reconnectDelays = new Map<string, number>();
  private maxReconnectDelay = 30000; // 30 seconds
  private initialReconnectDelay = 1000; // 1 second
  private isShuttingDown = false;
  private statusListeners = new Set<(status: 'connected' | 'disconnected' | 'reconnecting') => void>();
  
  constructor() {
    // Listen for page unload to cleanup
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.shutdown();
      });
    }
  }

  /**
   * Create or replace a WebSocket connection with automatic reconnection
   */
  connect(
    key: string,
    url: string,
    handlers: Omit<WebSocketConfig, 'url'>,
    autoReconnect: boolean = true
  ): WebSocket {
    // Cancel any pending reconnect for this key
    this.cancelReconnect(key);
    
    // Close existing connection if any
    this.disconnect(key);
    
    if (this.isShuttingDown) {
      throw new Error('WebSocketManager is shutting down');
    }
    
    const config: WebSocketConfig = { url, ...handlers };
    const connectionId = `${key}_${Date.now()}`;
    
    if (DEBUG_MODE) {
      console.log(`[WebSocketManager] Creating connection: ${key} (${connectionId})`);
    }
    
    // Create new WebSocket
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      if (DEBUG_MODE) {
        console.error(`[WebSocketManager] Failed to create WebSocket for ${key}:`, e);
      }
      throw e;
    }
    
    // Wrap handlers to add management logic
    const managedHandlers = this.wrapHandlers(key, config, autoReconnect);
    
    ws.onopen = managedHandlers.onOpen;
    ws.onmessage = managedHandlers.onMessage;
    ws.onerror = managedHandlers.onError;
    ws.onclose = managedHandlers.onClose;
    
    // Store connection
    const managed: ManagedWebSocket = {
      ws,
      config,
      connectionId,
      createdAt: Date.now()
    };
    
    this.connections.set(key, managed);
    
    // Reset reconnect delay on successful connection
    if (ws.readyState === WebSocket.CONNECTING) {
      const originalOnOpen = ws.onopen;
      ws.onopen = (event) => {
        this.reconnectDelays.delete(key);
        if (originalOnOpen) originalOnOpen(event);
      };
    }
    
    return ws;
  }

  /**
   * Disconnect a specific WebSocket
   */
  disconnect(key: string) {
    const managed = this.connections.get(key);
    if (!managed) return;
    
    if (DEBUG_MODE) {
      console.log(`[WebSocketManager] Disconnecting: ${key} (${managed.connectionId})`);
    }
    
    // Cancel any pending reconnect
    this.cancelReconnect(key);
    
    // Remove from connections before closing to prevent reconnect
    this.connections.delete(key);
    
    // Clean up WebSocket
    const { ws } = managed;
    
    // Remove all event handlers
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    
    // Close if not already closed
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      try {
        ws.close(1000, 'Intentional disconnect');
      } catch (e) {
        if (DEBUG_MODE) {
          console.error(`[WebSocketManager] Error closing WebSocket for ${key}:`, e);
        }
      }
    }
    
    this.notifyStatusChange();
  }

  /**
   * Get active connection for a key
   */
  getConnection(key: string): WebSocket | null {
    const managed = this.connections.get(key);
    return managed?.ws || null;
  }

  /**
   * Get all active connections
   */
  getAllConnections(): Map<string, WebSocket> {
    const result = new Map<string, WebSocket>();
    this.connections.forEach((managed, key) => {
      result.set(key, managed.ws);
    });
    return result;
  }

  /**
   * Check if a connection is active
   */
  isConnected(key: string): boolean {
    const ws = this.getConnection(key);
    return ws !== null && ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection statistics
   */
  getStats() {
    const stats = {
      totalConnections: this.connections.size,
      activeConnections: 0,
      pendingReconnects: this.reconnectTimeouts.size,
      connections: [] as any[]
    };
    
    this.connections.forEach((managed, key) => {
      const isActive = managed.ws.readyState === WebSocket.OPEN;
      if (isActive) stats.activeConnections++;
      
      stats.connections.push({
        key,
        connectionId: managed.connectionId,
        state: this.getReadyStateString(managed.ws.readyState),
        createdAt: new Date(managed.createdAt).toISOString(),
        ageMs: Date.now() - managed.createdAt,
        url: managed.config.url
      });
    });
    
    return stats;
  }

  /**
   * Shutdown all connections
   */
  shutdown() {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    
    if (DEBUG_MODE) {
      console.log('[WebSocketManager] Shutting down all connections');
    }
    
    // Cancel all reconnects
    this.reconnectTimeouts.forEach((timeout, key) => {
      clearTimeout(timeout);
    });
    this.reconnectTimeouts.clear();
    this.reconnectDelays.clear();
    
    // Close all connections
    const keys = Array.from(this.connections.keys());
    keys.forEach(key => this.disconnect(key));
  }

  /**
   * Wrap handlers with management logic
   */
  private wrapHandlers(
    key: string,
    config: WebSocketConfig,
    autoReconnect: boolean
  ) {
    const manager = this;
    
    return {
      onOpen: function(this: WebSocket, event: Event) {
        if (DEBUG_MODE) {
          console.log(`[WebSocketManager] Connection opened: ${key}`);
        }
        config.onOpen.call(this);
        manager.notifyStatusChange();
      },
      
      onMessage: function(this: WebSocket, event: MessageEvent) {
        config.onMessage.call(this, event);
      },
      
      onError: function(this: WebSocket, event: Event) {
        if (DEBUG_MODE) {
          console.error(`[WebSocketManager] Connection error: ${key}`, event);
        }
        config.onError.call(this, event);
      },
      
      onClose: function(this: WebSocket, event: CloseEvent) {
        if (DEBUG_MODE) {
          console.log(`[WebSocketManager] Connection closed: ${key} (code: ${event.code})`);
        }
        
        config.onClose.call(this);
        
        // Check if this connection is still current
        const current = manager.connections.get(key);
        const isCurrent = current && current.ws === this;
        
        // Schedule reconnect if appropriate
        if (autoReconnect && isCurrent && !manager.isShuttingDown && event.code !== 1000) {
          manager.scheduleReconnect(key, config);
        }
        
        manager.notifyStatusChange();
      }
    };
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(key: string, config: WebSocketConfig) {
    // Cancel any existing reconnect timeout
    this.cancelReconnect(key);
    
    // Calculate delay with exponential backoff
    let delay = this.reconnectDelays.get(key) || this.initialReconnectDelay;
    delay = Math.min(delay * 1.5, this.maxReconnectDelay);
    this.reconnectDelays.set(key, delay);
    
    if (DEBUG_MODE) {
      console.log(`[WebSocketManager] Scheduling reconnect for ${key} in ${delay}ms`);
    }
    
    const timeout = setTimeout(() => {
      this.reconnectTimeouts.delete(key);
      
      if (this.isShuttingDown) return;
      
      try {
        this.connect(key, config.url, {
          onOpen: config.onOpen,
          onMessage: config.onMessage,
          onError: config.onError,
          onClose: config.onClose
        }, true);
      } catch (e) {
        if (DEBUG_MODE) {
          console.error(`[WebSocketManager] Reconnect failed for ${key}:`, e);
        }
        // Schedule another reconnect
        this.scheduleReconnect(key, config);
      }
    }, delay);
    
    this.reconnectTimeouts.set(key, timeout);
  }

  /**
   * Cancel pending reconnect
   */
  private cancelReconnect(key: string) {
    const timeout = this.reconnectTimeouts.get(key);
    if (timeout) {
      clearTimeout(timeout);
      this.reconnectTimeouts.delete(key);
      
      if (DEBUG_MODE) {
        console.log(`[WebSocketManager] Cancelled reconnect for ${key}`);
      }
    }
  }

  /**
   * Get readable ready state string
   */
  private getReadyStateString(readyState: number): string {
    switch (readyState) {
      case WebSocket.CONNECTING: return 'CONNECTING';
      case WebSocket.OPEN: return 'OPEN';
      case WebSocket.CLOSING: return 'CLOSING';
      case WebSocket.CLOSED: return 'CLOSED';
      default: return 'UNKNOWN';
    }
  }
  
  /**
   * Get overall connection status
   */
  getOverallStatus(): 'connected' | 'disconnected' | 'reconnecting' {
    let hasOpen = false;
    let hasConnecting = false;
    
    this.connections.forEach(managed => {
      if (managed.ws.readyState === WebSocket.OPEN) {
        hasOpen = true;
      } else if (managed.ws.readyState === WebSocket.CONNECTING) {
        hasConnecting = true;
      }
    });
    
    if (hasOpen) return 'connected';
    if (hasConnecting || this.reconnectTimeouts.size > 0) return 'reconnecting';
    return 'disconnected';
  }
  
  /**
   * Add a status listener
   */
  addStatusListener(listener: (status: 'connected' | 'disconnected' | 'reconnecting') => void) {
    this.statusListeners.add(listener);
    // Immediately call with current status
    listener(this.getOverallStatus());
  }
  
  /**
   * Remove a status listener
   */
  removeStatusListener(listener: (status: 'connected' | 'disconnected' | 'reconnecting') => void) {
    this.statusListeners.delete(listener);
  }
  
  /**
   * Notify all status listeners
   */
  private notifyStatusChange() {
    const status = this.getOverallStatus();
    this.statusListeners.forEach(listener => {
      try {
        listener(status);
      } catch (e) {
        console.error('[WebSocketManager] Error in status listener:', e);
      }
    });
  }
}

// Export singleton instance
export const webSocketManager = new WebSocketManager();