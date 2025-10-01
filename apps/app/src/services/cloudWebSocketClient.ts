/**
 * Cloud WebSocket Client
 * Connects to Fly machine WebSocket server for real-time updates
 */

// Simple browser-compatible EventEmitter
class EventEmitter {
  private events: { [key: string]: Function[] } = {};

  on(event: string, listener: Function): void {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
  }

  off(event: string, listener: Function): void {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(l => l !== listener);
  }

  emit(event: string, ...args: any[]): void {
    if (!this.events[event]) return;
    this.events[event].forEach(listener => listener(...args));
  }

  removeAllListeners(event?: string): void {
    if (event) {
      delete this.events[event];
    } else {
      this.events = {};
    }
  }
}

// Message types from Fly machine
export type MachineToBrowserMessage =
  | {
      type: 'status_update';
      data: {
        status: 'provisioning' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
        cpus: number;
        uptime: number;
      };
    }
  | {
      type: 'metrics_update';
      data: {
        activeSignals: number;
        queueDepth: number;
        cpuUsage: number;
        memoryUsage: number;
      };
    }
  | {
      type: 'signal_created';
      data: {
        signalId: string;
        traderId: string;
        symbol: string;
        price: number;
      };
    }
  | {
      type: 'analysis_completed';
      data: {
        signalId: string;
        decision: string;
        confidence: number;
      };
    }
  | {
      type: 'error';
      data: {
        message: string;
        code?: string;
      };
    };

// Message types to Fly machine
export type BrowserToMachineMessage =
  | {
      type: 'config_update';
      data: {
        traders: any[];
        version: number;
      };
    }
  | {
      type: 'pause_execution';
      data: {};
    }
  | {
      type: 'resume_execution';
      data: {};
    }
  | {
      type: 'force_sync';
      data: {};
    };

export interface CloudMachineStatus {
  machineId: string;
  status: 'provisioning' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  cpus: number;
  uptime: number;
  websocketUrl: string;
}

export interface CloudMetrics {
  activeSignals: number;
  queueDepth: number;
  cpuUsage: number;
  memoryUsage: number;
  timestamp: number;
}

class CloudWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private websocketUrl: string = '';
  private userId: string = '';
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastPongTime = 0;
  private connectionHealthy = true;

  // Message queue for offline scenario
  private messageQueue: BrowserToMachineMessage[] = [];
  private maxQueueSize = 50;

  // Circuit breaker pattern
  private failureCount = 0;
  private circuitBreakerThreshold = 3;
  private circuitBreakerResetTime = 60000; // 1 minute
  private circuitBreakerOpen = false;
  private circuitBreakerResetTimeout: NodeJS.Timeout | null = null;

  // State
  private machineStatus: CloudMachineStatus | null = null;
  private latestMetrics: CloudMetrics | null = null;

  constructor() {
    super();
  }

  /**
   * Connect to Fly machine WebSocket
   */
  connect(machineId: string, websocketUrl: string, userId: string): void {
    if (this.ws && this.isConnected) {
      console.warn('[CloudWebSocket] Already connected');
      return;
    }

    // Check circuit breaker
    if (this.circuitBreakerOpen) {
      console.warn('[CloudWebSocket] Circuit breaker is open, connection attempt blocked');
      this.emit('connection_blocked', { reason: 'circuit_breaker' });
      return;
    }

    this.websocketUrl = websocketUrl;
    this.userId = userId;

    console.log(`[CloudWebSocket] Connecting to ${websocketUrl}...`);

    try {
      // Add userId as query parameter
      const url = new URL(websocketUrl);
      url.searchParams.set('userId', userId);

      this.ws = new WebSocket(url.toString());

      this.ws.onopen = () => {
        console.log('[CloudWebSocket] Connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.failureCount = 0;
        this.connectionHealthy = true;
        this.lastPongTime = Date.now();

        // Start ping interval
        this.startPingInterval();

        // Start health check
        this.startHealthCheck();

        // Flush message queue
        this.flushMessageQueue();

        this.emit('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const message: MachineToBrowserMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('[CloudWebSocket] Failed to parse message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[CloudWebSocket] Error:', error);
        this.failureCount++;
        this.emit('error', error);

        // Check circuit breaker
        if (this.failureCount >= this.circuitBreakerThreshold) {
          this.openCircuitBreaker();
        }
      };

      this.ws.onclose = () => {
        console.log('[CloudWebSocket] Disconnected');
        this.isConnected = false;
        this.connectionHealthy = false;

        // Stop ping interval
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }

        // Stop health check
        if (this.healthCheckInterval) {
          clearInterval(this.healthCheckInterval);
          this.healthCheckInterval = null;
        }

        this.emit('disconnected');

        // Attempt reconnection
        this.attemptReconnect();
      };

    } catch (error) {
      console.error('[CloudWebSocket] Connection error:', error);
      this.emit('error', error);
    }
  }

  /**
   * Disconnect from Fly machine
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.reconnectAttempts = 0;
  }

  /**
   * Send message to Fly machine
   */
  send(message: BrowserToMachineMessage): void {
    if (!this.ws || !this.isConnected) {
      console.warn('[CloudWebSocket] Not connected, queueing message');
      this.queueMessage(message);
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('[CloudWebSocket] Failed to send message:', error);
      this.queueMessage(message);
    }
  }

  /**
   * Queue message for later delivery
   */
  private queueMessage(message: BrowserToMachineMessage): void {
    if (this.messageQueue.length >= this.maxQueueSize) {
      console.warn('[CloudWebSocket] Message queue full, dropping oldest message');
      this.messageQueue.shift();
    }
    this.messageQueue.push(message);
  }

  /**
   * Flush message queue when connection restored
   */
  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) return;

    console.log(`[CloudWebSocket] Flushing ${this.messageQueue.length} queued messages`);

    const messages = [...this.messageQueue];
    this.messageQueue = [];

    messages.forEach(message => {
      try {
        if (this.ws && this.isConnected) {
          this.ws.send(JSON.stringify(message));
        }
      } catch (error) {
        console.error('[CloudWebSocket] Failed to send queued message:', error);
      }
    });
  }

  /**
   * Update trader configuration
   */
  updateConfig(traders: any[], version: number): void {
    this.send({
      type: 'config_update',
      data: { traders, version }
    });
  }

  /**
   * Pause execution
   */
  pauseExecution(): void {
    this.send({
      type: 'pause_execution',
      data: {}
    });
  }

  /**
   * Resume execution
   */
  resumeExecution(): void {
    this.send({
      type: 'resume_execution',
      data: {}
    });
  }

  /**
   * Force sync
   */
  forceSync(): void {
    this.send({
      type: 'force_sync',
      data: {}
    });
  }

  /**
   * Get current machine status
   */
  getMachineStatus(): CloudMachineStatus | null {
    return this.machineStatus;
  }

  /**
   * Get latest metrics
   */
  getMetrics(): CloudMetrics | null {
    return this.latestMetrics;
  }

  /**
   * Is connected
   */
  getIsConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Handle incoming message from Fly machine
   */
  private handleMessage(message: MachineToBrowserMessage): void {
    // Update pong time for health check
    if ((message as any).type === 'pong') {
      this.lastPongTime = Date.now();
      this.connectionHealthy = true;
      return;
    }

    switch (message.type) {
      case 'status_update':
        this.machineStatus = {
          machineId: this.machineStatus?.machineId || '',
          status: message.data.status,
          cpus: message.data.cpus,
          uptime: message.data.uptime,
          websocketUrl: this.websocketUrl
        };
        this.emit('status_update', message.data);
        break;

      case 'metrics_update':
        this.latestMetrics = {
          ...message.data,
          timestamp: Date.now()
        };
        this.emit('metrics_update', message.data);
        break;

      case 'signal_created':
        this.emit('signal_created', message.data);
        break;

      case 'analysis_completed':
        this.emit('analysis_completed', message.data);
        break;

      case 'error':
        console.error('[CloudWebSocket] Machine error:', message.data);
        this.emit('machine_error', message.data);
        break;

      default:
        console.warn('[CloudWebSocket] Unknown message type:', (message as any).type);
    }
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPingInterval(): void {
    // Send ping every 25 seconds (server expects pong within 30s)
    this.pingInterval = setInterval(() => {
      if (this.ws && this.isConnected) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        } catch (error) {
          console.error('[CloudWebSocket] Failed to send ping:', error);
        }
      }
    }, 25000);
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[CloudWebSocket] Max reconnection attempts reached');
      this.emit('connection_failed');
      return;
    }

    this.reconnectAttempts++;
    console.log(`[CloudWebSocket] Reconnecting (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect(
        this.machineStatus?.machineId || '',
        this.websocketUrl,
        this.userId
      );
    }, this.reconnectDelay);

    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
  }

  /**
   * Start connection health check
   */
  private startHealthCheck(): void {
    // Check connection health every 10 seconds
    this.healthCheckInterval = setInterval(() => {
      const timeSinceLastPong = Date.now() - this.lastPongTime;

      // If no pong in 60 seconds, consider connection unhealthy
      if (timeSinceLastPong > 60000) {
        console.warn('[CloudWebSocket] Connection appears unhealthy, reconnecting...');
        this.connectionHealthy = false;
        this.emit('connection_unhealthy');

        // Force reconnect
        if (this.ws) {
          this.ws.close();
        }
      }
    }, 10000);
  }

  /**
   * Open circuit breaker
   */
  private openCircuitBreaker(): void {
    console.error('[CloudWebSocket] Opening circuit breaker due to repeated failures');
    this.circuitBreakerOpen = true;
    this.emit('circuit_breaker_opened');

    // Reset circuit breaker after timeout
    this.circuitBreakerResetTimeout = setTimeout(() => {
      console.log('[CloudWebSocket] Resetting circuit breaker');
      this.circuitBreakerOpen = false;
      this.failureCount = 0;
      this.emit('circuit_breaker_reset');
    }, this.circuitBreakerResetTime);
  }

  /**
   * Get connection health status
   */
  getConnectionHealth(): {
    isHealthy: boolean;
    isConnected: boolean;
    reconnectAttempts: number;
    circuitBreakerOpen: boolean;
    queuedMessages: number;
  } {
    return {
      isHealthy: this.connectionHealthy,
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      circuitBreakerOpen: this.circuitBreakerOpen,
      queuedMessages: this.messageQueue.length
    };
  }

  /**
   * Clear message queue
   */
  clearMessageQueue(): void {
    console.log(`[CloudWebSocket] Clearing ${this.messageQueue.length} queued messages`);
    this.messageQueue = [];
  }

  /**
   * Manually reset circuit breaker
   */
  resetCircuitBreaker(): void {
    console.log('[CloudWebSocket] Manually resetting circuit breaker');
    this.circuitBreakerOpen = false;
    this.failureCount = 0;

    if (this.circuitBreakerResetTimeout) {
      clearTimeout(this.circuitBreakerResetTimeout);
      this.circuitBreakerResetTimeout = null;
    }

    this.emit('circuit_breaker_reset');
  }
}

// Export singleton instance
export const cloudWebSocketClient = new CloudWebSocketClient();
