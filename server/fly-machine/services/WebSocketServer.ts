/**
 * WebSocket Server - Browser Communication
 * Provides real-time updates to the browser client
 */

import { EventEmitter } from 'events';
import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { Server as HTTPServer } from 'http';
import {
  MachineToBrowserMessage,
  BrowserToMachineMessage,
  HealthStatus
} from '../types';

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  connectedAt: Date;
  lastPing: Date;
  isAlive: boolean;
}

export class WebSocketServer extends EventEmitter {
  private wss: WSServer | null = null;
  private clients = new Map<string, ConnectedClient>();
  private pingInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  private config = {
    port: 8080,
    pingIntervalMs: 30000, // 30 seconds
    connectionTimeout: 60000 // 1 minute
  };

  constructor(port?: number) {
    super();
    if (port) {
      this.config.port = port;
    }
  }

  async start(httpServer?: HTTPServer): Promise<void> {
    if (this.isRunning) {
      return;
    }

    console.log('[WebSocketServer] Starting WebSocket server...');

    // Create WebSocket server
    if (httpServer) {
      this.wss = new WSServer({ server: httpServer });
    } else {
      this.wss = new WSServer({ port: this.config.port });
    }

    this.wss.on('connection', (ws: WebSocket, req: any) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error: Error) => {
      console.error('[WebSocketServer] Server error:', error);
      this.emit('error', error);
    });

    // Start ping/pong mechanism
    this.startPingInterval();

    this.isRunning = true;

    const address = httpServer ? 'attached to HTTP server' : `port ${this.config.port}`;
    console.log(`[WebSocketServer] WebSocket server started on ${address}`);
  }

  private handleConnection(ws: WebSocket, req: any): void {
    // Extract userId from query parameters or headers
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId') || 'anonymous';

    const clientId = `${userId}-${Date.now()}`;

    const client: ConnectedClient = {
      ws,
      userId,
      connectedAt: new Date(),
      lastPing: new Date(),
      isAlive: true
    };

    this.clients.set(clientId, client);

    console.log(`[WebSocketServer] Client connected: ${clientId} (user: ${userId})`);
    this.emit('client_connected', { clientId, userId });

    // Handle pong responses
    ws.on('pong', () => {
      client.isAlive = true;
      client.lastPing = new Date();
    });

    // Handle incoming messages
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as BrowserToMachineMessage;
        this.handleMessage(clientId, message);
      } catch (error) {
        console.error('[WebSocketServer] Failed to parse message:', error);
        this.sendError(clientId, 'Invalid message format');
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      console.log(`[WebSocketServer] Client disconnected: ${clientId}`);
      this.clients.delete(clientId);
      this.emit('client_disconnected', { clientId, userId });
    });

    // Handle errors
    ws.on('error', (error: Error) => {
      console.error(`[WebSocketServer] Client error (${clientId}):`, error);
      this.emit('client_error', { clientId, userId, error });
    });

    // Send welcome message
    this.send(clientId, {
      type: 'status_update',
      data: {
        status: 'running',
        cpus: 1,
        uptime: 0
      }
    });
  }

  private handleMessage(clientId: string, message: BrowserToMachineMessage): void {
    console.log(`[WebSocketServer] Message from ${clientId}:`, message.type);

    switch (message.type) {
      case 'config_update':
        this.emit('config_update', {
          clientId,
          traders: message.data.traders,
          version: message.data.version
        });
        break;

      case 'pause_execution':
        this.emit('pause_execution', { clientId });
        break;

      case 'resume_execution':
        this.emit('resume_execution', { clientId });
        break;

      case 'force_sync':
        this.emit('force_sync', { clientId });
        break;

      default:
        console.warn(`[WebSocketServer] Unknown message type from ${clientId}`);
    }
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      this.clients.forEach((client, clientId) => {
        if (!client.isAlive) {
          console.log(`[WebSocketServer] Client timeout: ${clientId}`);
          client.ws.terminate();
          this.clients.delete(clientId);
          return;
        }

        // Mark as not alive and send ping
        client.isAlive = false;
        client.ws.ping();
      });
    }, this.config.pingIntervalMs);
  }

  send(clientId: string, message: MachineToBrowserMessage): boolean {
    const client = this.clients.get(clientId);

    if (!client) {
      console.warn(`[WebSocketServer] Client not found: ${clientId}`);
      return false;
    }

    if (client.ws.readyState !== WebSocket.OPEN) {
      console.warn(`[WebSocketServer] Client not ready: ${clientId}`);
      return false;
    }

    try {
      client.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`[WebSocketServer] Failed to send message to ${clientId}:`, error);
      return false;
    }
  }

  broadcast(message: MachineToBrowserMessage, userId?: string): number {
    let sentCount = 0;

    this.clients.forEach((client, clientId) => {
      // If userId specified, only send to that user's clients
      if (userId && client.userId !== userId) {
        return;
      }

      if (this.send(clientId, message)) {
        sentCount++;
      }
    });

    return sentCount;
  }

  broadcastStatusUpdate(status: string, cpus: number, uptime: number): void {
    this.broadcast({
      type: 'status_update',
      data: { status: status as any, cpus, uptime }
    });
  }

  broadcastMetricsUpdate(metrics: {
    activeSignals: number;
    queueDepth: number;
    cpuUsage: number;
    memoryUsage: number;
  }): void {
    this.broadcast({
      type: 'metrics_update',
      data: metrics
    });
  }

  broadcastSignalCreated(signal: {
    signalId: string;
    traderId: string;
    symbol: string;
    price: number;
  }): void {
    this.broadcast({
      type: 'signal_created',
      data: signal
    });
  }

  broadcastAnalysisCompleted(analysis: {
    signalId: string;
    decision: string;
    confidence: number;
    reasoning?: string;
    tradePlan?: any;
  }): void {
    this.broadcast({
      type: 'analysis_completed',
      data: analysis
    });
  }

  private sendError(clientId: string, message: string, code?: string): void {
    this.send(clientId, {
      type: 'error',
      data: { message, code }
    });
  }

  getConnectedClients(): Array<{ clientId: string; userId: string; connectedAt: Date }> {
    return Array.from(this.clients.entries()).map(([clientId, client]) => ({
      clientId,
      userId: client.userId,
      connectedAt: client.connectedAt
    }));
  }

  getClientCount(): number {
    return this.clients.size;
  }

  async stop(): Promise<void> {
    console.log('[WebSocketServer] Stopping...');
    this.isRunning = false;

    // Stop ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Close all client connections
    this.clients.forEach((client, clientId) => {
      console.log(`[WebSocketServer] Closing client: ${clientId}`);
      client.ws.close();
    });

    this.clients.clear();

    // Close server
    if (this.wss) {
      await new Promise<void>((resolve, reject) => {
        this.wss!.close((err) => {
          if (err) {
            console.error('[WebSocketServer] Error closing server:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }

    console.log('[WebSocketServer] Stopped');
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      clientCount: this.clients.size,
      clients: this.getConnectedClients(),
      config: { ...this.config }
    };
  }
}
