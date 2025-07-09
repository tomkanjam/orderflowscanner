import { EventEmitter } from '../../utils/EventEmitter';
import {
  ITradingEngine,
  TradingMode,
  OrderRequest,
  Order,
  Position,
  Balance,
  OrderUpdate,
  PositionUpdate,
  Trade,
  OrderValidation,
  ExchangeAccount
} from '../../abstractions/trading.interfaces';

export abstract class BaseTradingEngine extends EventEmitter implements ITradingEngine {
  protected mode: TradingMode;
  protected account?: ExchangeAccount;
  protected orders: Map<string, Order> = new Map();
  protected positions: Map<string, Position> = new Map();
  protected balances: Map<string, Balance> = new Map();
  protected initialized = false;

  constructor(mode: TradingMode, account?: ExchangeAccount) {
    super();
    this.mode = mode;
    this.account = account;
  }

  getMode(): TradingMode {
    return this.mode;
  }

  // Validation helpers
  protected validateOrder(request: OrderRequest): OrderValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!request.symbol) errors.push('Symbol is required');
    if (!request.side) errors.push('Side is required');
    if (!request.type) errors.push('Order type is required');
    if (!request.quantity || request.quantity <= 0) errors.push('Quantity must be positive');

    // Type-specific validation
    if (request.type === 'limit' && !request.price) {
      errors.push('Price is required for limit orders');
    }
    if ((request.type === 'stop' || request.type === 'stop_limit') && !request.stopPrice) {
      errors.push('Stop price is required for stop orders');
    }

    // Risk warnings
    const position = this.positions.get(request.symbol);
    if (position) {
      if (position.side === 'long' && request.side === 'sell' && !request.reduceOnly) {
        warnings.push('Selling while holding long position - this will open a short position');
      }
      if (position.side === 'short' && request.side === 'buy' && !request.reduceOnly) {
        warnings.push('Buying while holding short position - this will open a long position');
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  // Helper to generate order IDs
  protected generateOrderId(): string {
    return `${this.mode.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Helper to calculate order cost
  protected calculateOrderCost(order: Order): number {
    const price = order.averagePrice || order.price || 0;
    return price * order.filled;
  }

  // Emit order update
  protected emitOrderUpdate(order: Order, event: 'created' | 'updated' | 'filled' | 'canceled' | 'rejected') {
    const update: OrderUpdate = {
      order,
      event,
      timestamp: new Date()
    };
    this.emit('order', update);
  }

  // Emit position update
  protected emitPositionUpdate(position: Position, event: 'opened' | 'updated' | 'closed') {
    const update: PositionUpdate = {
      position,
      event,
      timestamp: new Date()
    };
    this.emit('position', update);
  }

  // Helper to update order status
  protected updateOrderStatus(
    orderId: string, 
    updates: Partial<Order>,
    event: 'updated' | 'filled' | 'canceled' | 'rejected'
  ): Order | null {
    const order = this.orders.get(orderId);
    if (!order) return null;

    // Update order
    Object.assign(order, updates, {
      lastUpdated: new Date()
    });

    // Emit update
    this.emitOrderUpdate(order, event);

    return order;
  }

  // Abstract methods that must be implemented by subclasses
  abstract createOrder(request: OrderRequest): Promise<Order>;
  abstract cancelOrder(orderId: string, symbol?: string): Promise<Order>;
  abstract getOrder(orderId: string, symbol?: string): Promise<Order>;
  abstract getOrders(symbol?: string, since?: Date, limit?: number): Promise<Order[]>;
  abstract getOpenOrders(symbol?: string): Promise<Order[]>;
  abstract getPositions(symbols?: string[]): Promise<Position[]>;
  abstract getPosition(symbol: string): Promise<Position | null>;
  abstract closePosition(symbol: string, reduceOnly?: boolean): Promise<Order>;
  abstract getBalances(): Promise<Balance[]>;
  abstract getBalance(currency: string): Promise<Balance | null>;
  abstract initialize(): Promise<void>;
  abstract shutdown(): Promise<void>;

  // Market data - can be overridden but has default implementation
  async getTicker(symbol: string): Promise<any> {
    // Default implementation could fetch from Binance WebSocket data
    // Subclasses can override if they want different data source
    throw new Error('getTicker not implemented');
  }

  async getOrderBook(symbol: string, limit?: number): Promise<any> {
    // Default implementation
    throw new Error('getOrderBook not implemented');
  }

  // Cleanup listeners
  removeAllListeners(): this {
    super.removeAllListeners();
    return this;
  }
}