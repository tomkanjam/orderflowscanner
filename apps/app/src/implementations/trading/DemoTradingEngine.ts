import { BaseTradingEngine } from './BaseTradingEngine';
import {
  TradingMode,
  OrderRequest,
  Order,
  Position,
  Balance,
  Trade
} from '../../abstractions/trading.interfaces';
import { Ticker } from '../../../types';

export class DemoTradingEngine extends BaseTradingEngine {
  private demoBalance: number = 10000; // Starting with $10,000 USDT
  private tickerData: Map<string, Ticker> = new Map();
  private nextTradeId = 1;

  constructor() {
    super({ type: 'demo' });
    console.log('[DemoTradingEngine] Initialized with $10,000 USDT');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize demo balance
    this.balances.set('USDT', {
      currency: 'USDT',
      free: this.demoBalance,
      used: 0,
      total: this.demoBalance
    });

    this.initialized = true;
    console.log('[DemoTradingEngine] Demo trading engine initialized');
  }

  async shutdown(): Promise<void> {
    this.removeAllListeners();
    this.orders.clear();
    this.positions.clear();
    this.balances.clear();
    this.initialized = false;
    console.log('[DemoTradingEngine] Demo trading engine shut down');
  }

  // Update market prices for demo execution
  updateMarketPrice(symbol: string, ticker: Ticker) {
    this.tickerData.set(symbol, ticker);
    
    // Update position mark prices and P&L
    const position = this.positions.get(symbol);
    if (position) {
      const currentPrice = parseFloat(ticker.c);
      this.updatePositionPnL(position, currentPrice);
    }

    // Check and execute any pending orders
    this.checkPendingOrders(symbol, parseFloat(ticker.c));
  }

  async createOrder(request: OrderRequest): Promise<Order> {
    // Validate order
    const validation = this.validateOrder(request);
    if (!validation.isValid) {
      throw new Error(`Invalid order: ${validation.errors?.join(', ')}`);
    }

    // Get current market price
    const ticker = this.tickerData.get(request.symbol);
    if (!ticker) {
      throw new Error(`No market data available for ${request.symbol}`);
    }
    const marketPrice = parseFloat(ticker.c);

    // Check balance
    const balance = await this.getBalance('USDT');
    if (!balance) {
      throw new Error('No USDT balance available');
    }

    const orderCost = request.quantity * (request.price || marketPrice);
    if (orderCost > balance.free) {
      throw new Error(`Insufficient balance. Required: ${orderCost.toFixed(2)} USDT, Available: ${balance.free.toFixed(2)} USDT`);
    }

    // Create order
    const order: Order = {
      id: this.generateOrderId(),
      clientOrderId: request.clientOrderId,
      symbol: request.symbol,
      exchange: 'demo',
      side: request.side,
      type: request.type,
      status: request.type === 'market' ? 'closed' : 'open',
      price: request.price,
      averagePrice: request.type === 'market' ? marketPrice : undefined,
      quantity: request.quantity,
      filled: request.type === 'market' ? request.quantity : 0,
      remaining: request.type === 'market' ? 0 : request.quantity,
      cost: 0,
      trades: [],
      timestamp: new Date(),
      lastUpdated: new Date(),
      metadata: request.metadata
    };

    // Execute market orders immediately
    if (request.type === 'market') {
      await this.executeMarketOrder(order, marketPrice);
    } else {
      // For limit/stop orders, lock the balance
      this.lockBalance(orderCost);
    }

    // Store order
    this.orders.set(order.id, order);
    
    // Emit creation event
    this.emitOrderUpdate(order, 'created');

    return order;
  }

  private async executeMarketOrder(order: Order, price: number): Promise<void> {
    // Create trade
    const trade: Trade = {
      id: `demo-trade-${this.nextTradeId++}`,
      orderId: order.id,
      symbol: order.symbol,
      exchange: 'demo',
      side: order.side,
      price: price,
      quantity: order.quantity,
      cost: price * order.quantity,
      fee: {
        currency: 'USDT',
        cost: price * order.quantity * 0.001 // 0.1% fee
      },
      timestamp: new Date()
    };

    // Update order
    order.averagePrice = price;
    order.filled = order.quantity;
    order.remaining = 0;
    order.cost = trade.cost;
    order.fee = trade.fee;
    order.trades = [trade];
    order.status = 'closed';

    // Update balance
    await this.updateBalanceForTrade(order, trade);

    // Update or create position
    await this.updatePositionForTrade(order, trade);

    // Emit filled event
    this.emitOrderUpdate(order, 'filled');
  }

  private async updateBalanceForTrade(order: Order, trade: Trade): Promise<void> {
    const balance = this.balances.get('USDT');
    if (!balance) return;

    const totalCost = trade.cost + (trade.fee?.cost || 0);
    
    if (order.side === 'buy') {
      balance.free -= totalCost;
    } else {
      // For sells, add proceeds minus fees
      balance.free += trade.cost - (trade.fee?.cost || 0);
    }

    balance.total = balance.free + balance.used;
  }

  private async updatePositionForTrade(order: Order, trade: Trade): Promise<void> {
    let position = this.positions.get(order.symbol);
    
    if (!position) {
      // Create new position
      position = {
        id: `demo-pos-${order.symbol}`,
        symbol: order.symbol,
        exchange: 'demo',
        side: order.side === 'buy' ? 'long' : 'short',
        contracts: trade.quantity,
        entryPrice: trade.price,
        markPrice: trade.price,
        unrealizedPnl: 0,
        realizedPnl: 0,
        percentage: 0,
        timestamp: new Date(),
        lastUpdated: new Date()
      };
      
      this.positions.set(order.symbol, position);
      this.emitPositionUpdate(position, 'opened');
    } else {
      // Update existing position
      if ((position.side === 'long' && order.side === 'buy') || 
          (position.side === 'short' && order.side === 'sell')) {
        // Adding to position
        const totalCost = position.contracts * position.entryPrice + trade.quantity * trade.price;
        position.contracts += trade.quantity;
        position.entryPrice = totalCost / position.contracts;
      } else {
        // Reducing or reversing position
        if (trade.quantity >= position.contracts) {
          // Position closed or reversed
          const closedContracts = position.contracts;
          const remainingContracts = trade.quantity - closedContracts;
          
          // Calculate realized P&L for closed portion
          const pnl = this.calculateRealizedPnL(position, trade.price, closedContracts);
          position.realizedPnl += pnl;
          
          if (remainingContracts > 0) {
            // Reversed position
            position.side = position.side === 'long' ? 'short' : 'long';
            position.contracts = remainingContracts;
            position.entryPrice = trade.price;
            position.unrealizedPnl = 0;
            position.percentage = 0;
          } else {
            // Position fully closed
            this.positions.delete(order.symbol);
            this.emitPositionUpdate(position, 'closed');
            return;
          }
        } else {
          // Partial close
          const pnl = this.calculateRealizedPnL(position, trade.price, trade.quantity);
          position.realizedPnl += pnl;
          position.contracts -= trade.quantity;
        }
      }
      
      position.lastUpdated = new Date();
      this.emitPositionUpdate(position, 'updated');
    }
  }

  private calculateRealizedPnL(position: Position, exitPrice: number, contracts: number): number {
    const direction = position.side === 'long' ? 1 : -1;
    return (exitPrice - position.entryPrice) * contracts * direction;
  }

  private updatePositionPnL(position: Position, currentPrice: number): void {
    position.markPrice = currentPrice;
    const direction = position.side === 'long' ? 1 : -1;
    position.unrealizedPnl = (currentPrice - position.entryPrice) * position.contracts * direction;
    position.percentage = (position.unrealizedPnl / (position.entryPrice * position.contracts)) * 100;
    position.lastUpdated = new Date();
    
    // Emit update if P&L changed significantly (more than 0.1%)
    if (Math.abs(position.percentage) > 0.1) {
      this.emitPositionUpdate(position, 'updated');
    }
  }

  private checkPendingOrders(symbol: string, currentPrice: number): void {
    this.orders.forEach(order => {
      if (order.symbol !== symbol || order.status !== 'open') return;

      let shouldExecute = false;
      
      switch (order.type) {
        case 'limit':
          if (order.side === 'buy' && currentPrice <= (order.price || 0)) {
            shouldExecute = true;
          } else if (order.side === 'sell' && currentPrice >= (order.price || 0)) {
            shouldExecute = true;
          }
          break;
          
        case 'stop':
        case 'stop_limit':
          if (order.side === 'buy' && currentPrice >= (order.stopPrice || 0)) {
            shouldExecute = true;
          } else if (order.side === 'sell' && currentPrice <= (order.stopPrice || 0)) {
            shouldExecute = true;
          }
          break;
      }

      if (shouldExecute) {
        // Execute the order asynchronously
        this.executeMarketOrder(order, order.price || currentPrice).catch(err => {
          console.error('[DemoTradingEngine] Error executing pending order:', err);
          this.emit('error', err);
        });
      }
    });
  }

  private lockBalance(amount: number): void {
    const balance = this.balances.get('USDT');
    if (!balance) return;

    balance.free -= amount;
    balance.used += amount;
  }

  private unlockBalance(amount: number): void {
    const balance = this.balances.get('USDT');
    if (!balance) return;

    balance.free += amount;
    balance.used -= amount;
  }

  async cancelOrder(orderId: string): Promise<Order> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    if (order.status !== 'open') {
      throw new Error(`Cannot cancel order in status: ${order.status}`);
    }

    // Unlock balance for limit orders
    if (order.type === 'limit' && order.price) {
      const lockedAmount = (order.quantity - order.filled) * order.price;
      this.unlockBalance(lockedAmount);
    }

    // Update order status
    order.status = 'canceled';
    order.lastUpdated = new Date();

    // Emit cancellation event
    this.emitOrderUpdate(order, 'canceled');

    return order;
  }

  async getOrder(orderId: string): Promise<Order> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }
    return order;
  }

  async getOrders(symbol?: string, since?: Date, limit: number = 100): Promise<Order[]> {
    let orders = Array.from(this.orders.values());

    if (symbol) {
      orders = orders.filter(o => o.symbol === symbol);
    }

    if (since) {
      orders = orders.filter(o => o.timestamp >= since);
    }

    // Sort by timestamp descending
    orders.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return orders.slice(0, limit);
  }

  async getOpenOrders(symbol?: string): Promise<Order[]> {
    let orders = Array.from(this.orders.values()).filter(o => o.status === 'open');

    if (symbol) {
      orders = orders.filter(o => o.symbol === symbol);
    }

    return orders;
  }

  async getPositions(symbols?: string[]): Promise<Position[]> {
    let positions = Array.from(this.positions.values());

    if (symbols && symbols.length > 0) {
      positions = positions.filter(p => symbols.includes(p.symbol));
    }

    return positions;
  }

  async getPosition(symbol: string): Promise<Position | null> {
    return this.positions.get(symbol) || null;
  }

  async closePosition(symbol: string, reduceOnly: boolean = true): Promise<Order> {
    const position = this.positions.get(symbol);
    if (!position) {
      throw new Error(`No position found for ${symbol}`);
    }

    // Create market order to close position
    const orderRequest: OrderRequest = {
      symbol: symbol,
      side: position.side === 'long' ? 'sell' : 'buy',
      type: 'market',
      quantity: position.contracts,
      reduceOnly: reduceOnly
    };

    return this.createOrder(orderRequest);
  }

  async getBalances(): Promise<Balance[]> {
    return Array.from(this.balances.values());
  }

  async getBalance(currency: string): Promise<Balance | null> {
    return this.balances.get(currency) || null;
  }

  // Demo-specific methods
  setDemoBalance(amount: number): void {
    this.demoBalance = amount;
    const balance = this.balances.get('USDT');
    if (balance) {
      balance.free = amount - balance.used;
      balance.total = amount;
    }
  }

  getDemoStats(): {
    totalTrades: number;
    winRate: number;
    totalPnL: number;
    bestTrade: number;
    worstTrade: number;
  } {
    const closedOrders = Array.from(this.orders.values()).filter(o => o.status === 'closed');
    let wins = 0;
    let totalPnL = 0;
    let bestTrade = 0;
    let worstTrade = 0;

    // Calculate stats from positions
    this.positions.forEach(position => {
      totalPnL += position.realizedPnl;
    });

    // Add unrealized P&L
    this.positions.forEach(position => {
      totalPnL += position.unrealizedPnl;
    });

    return {
      totalTrades: closedOrders.length,
      winRate: closedOrders.length > 0 ? (wins / closedOrders.length) * 100 : 0,
      totalPnL,
      bestTrade,
      worstTrade
    };
  }
}