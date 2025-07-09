import { BaseTradingEngine } from './BaseTradingEngine';
import {
  TradingMode,
  OrderRequest,
  Order,
  Position,
  Balance,
  Trade,
  ExchangeAccount
} from '../../abstractions/trading.interfaces';
import { decrypt } from '../../services/encryption';

// CCXT types
type Exchange = any;
type ccxtModule = any;

export class CCXTTradingEngine extends BaseTradingEngine {
  private exchange: Exchange | null = null;
  private marketInfo: Map<string, any> = new Map();
  private watchdogInterval?: NodeJS.Timeout;

  constructor(account: ExchangeAccount) {
    super({ type: 'live', exchangeId: account.exchange }, account);
    
    if (!account) {
      throw new Error('Exchange account is required for live trading');
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized || !this.account) return;

    // Check if running in browser
    if (typeof window !== 'undefined') {
      console.warn('[CCXTTradingEngine] CCXT requires a Node.js environment for live trading.');
      console.warn('[CCXTTradingEngine] For browser-based trading, please use the exchange\'s official web API or consider running a proxy server.');
      throw new Error('Live trading is not supported in browser environment. Please use demo mode or set up a trading server.');
    }

    try {
      // Decrypt API credentials
      const apiKey = decrypt(this.account.apiKey);
      const apiSecret = decrypt(this.account.apiSecret);
      const password = this.account.password ? decrypt(this.account.password) : undefined;

      // CCXT would be imported and used here in a Node.js environment
      // This is a placeholder for the actual implementation
      throw new Error('CCXT-based live trading requires a Node.js server environment. Please use demo mode or implement a trading server.');
    } catch (error) {
      console.error('[CCXTTradingEngine] Initialization failed:', error);
      throw error;
    }
  }

  private setTestnetUrls(): void {
    if (!this.exchange || !this.account) return;

    // Set testnet URLs based on exchange
    switch (this.account.exchange) {
      case 'binance':
        this.exchange.urls['api'] = {
          public: 'https://testnet.binance.vision/api/v3',
          private: 'https://testnet.binance.vision/api/v3',
        };
        break;
      case 'bybit':
        this.exchange.urls['api'] = {
          public: 'https://api-testnet.bybit.com',
          private: 'https://api-testnet.bybit.com',
        };
        break;
      // Add more exchanges as needed
    }
  }

  async shutdown(): Promise<void> {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
    }
    
    this.removeAllListeners();
    this.exchange = null;
    this.initialized = false;
    console.log('[CCXTTradingEngine] Shut down');
  }

  private startOrderWatchdog(): void {
    // Poll for order updates every 5 seconds
    this.watchdogInterval = setInterval(async () => {
      try {
        await this.syncOpenOrders();
      } catch (error) {
        console.error('[CCXTTradingEngine] Watchdog error:', error);
        this.emit('error', error as Error);
      }
    }, 5000);
  }

  private async syncOpenOrders(): Promise<void> {
    if (!this.exchange) return;

    try {
      const openOrders = await this.exchange.fetchOpenOrders();
      
      // Update local order cache
      for (const ccxtOrder of openOrders) {
        const localOrder = this.orders.get(ccxtOrder.id);
        if (localOrder) {
          const updated = this.ccxtOrderToOrder(ccxtOrder);
          if (localOrder.filled !== updated.filled || localOrder.status !== updated.status) {
            this.orders.set(updated.id, updated);
            this.emitOrderUpdate(updated, 'updated');
          }
        }
      }
    } catch (error) {
      console.error('[CCXTTradingEngine] Failed to sync open orders:', error);
    }
  }

  private async fetchBalances(): Promise<void> {
    if (!this.exchange) return;

    try {
      const balances = await this.exchange.fetchBalance();
      
      // Update local balance cache
      this.balances.clear();
      for (const [currency, balance] of Object.entries(balances)) {
        if (balance.total > 0) {
          this.balances.set(currency, {
            currency,
            free: balance.free,
            used: balance.used,
            total: balance.total
          });
        }
      }
    } catch (error) {
      console.error('[CCXTTradingEngine] Failed to fetch balances:', error);
      throw error;
    }
  }

  private ccxtOrderToOrder(ccxtOrder: any): Order {
    return {
      id: ccxtOrder.id,
      clientOrderId: ccxtOrder.clientOrderId,
      symbol: ccxtOrder.symbol,
      exchange: this.account?.exchange || '',
      side: ccxtOrder.side as 'buy' | 'sell',
      type: ccxtOrder.type as any,
      status: this.mapOrderStatus(ccxtOrder.status),
      price: ccxtOrder.price,
      averagePrice: ccxtOrder.average,
      quantity: ccxtOrder.amount,
      filled: ccxtOrder.filled,
      remaining: ccxtOrder.remaining,
      cost: ccxtOrder.cost,
      fee: ccxtOrder.fee ? {
        currency: ccxtOrder.fee.currency,
        cost: ccxtOrder.fee.cost
      } : undefined,
      trades: [], // Would need to fetch separately
      timestamp: new Date(ccxtOrder.timestamp),
      lastUpdated: new Date(ccxtOrder.lastTradeTimestamp || ccxtOrder.timestamp)
    };
  }

  private mapOrderStatus(ccxtStatus: string): Order['status'] {
    switch (ccxtStatus) {
      case 'open': return 'open';
      case 'closed': return 'closed';
      case 'canceled': return 'canceled';
      case 'expired': return 'expired';
      case 'rejected': return 'rejected';
      default: return 'pending';
    }
  }

  async createOrder(request: OrderRequest): Promise<Order> {
    if (!this.exchange) {
      throw new Error('Exchange not initialized');
    }

    // Validate order
    const validation = this.validateOrder(request);
    if (!validation.isValid) {
      throw new Error(`Invalid order: ${validation.errors?.join(', ')}`);
    }

    try {
      // Prepare order parameters
      const symbol = request.symbol;
      const type = request.type;
      const side = request.side;
      const amount = request.quantity;
      const price = request.price;
      const params: any = {};

      if (request.clientOrderId) {
        params.clientOrderId = request.clientOrderId;
      }

      if (request.reduceOnly) {
        params.reduceOnly = true;
      }

      if (request.timeInForce) {
        params.timeInForce = request.timeInForce;
      }

      if (request.stopPrice) {
        params.stopPrice = request.stopPrice;
      }

      // Create order on exchange
      let ccxtOrder;
      switch (type) {
        case 'market':
          ccxtOrder = await this.exchange.createMarketOrder(symbol, side, amount, params);
          break;
        case 'limit':
          if (!price) throw new Error('Price required for limit order');
          ccxtOrder = await this.exchange.createLimitOrder(symbol, side, amount, price, params);
          break;
        case 'stop':
          if (!params.stopPrice) throw new Error('Stop price required for stop order');
          ccxtOrder = await this.exchange.createOrder(symbol, 'stop_market', side, amount, undefined, params);
          break;
        case 'stop_limit':
          if (!price || !params.stopPrice) throw new Error('Price and stop price required for stop limit order');
          ccxtOrder = await this.exchange.createOrder(symbol, 'stop_limit', side, amount, price, params);
          break;
        default:
          throw new Error(`Unsupported order type: ${type}`);
      }

      // Convert to our Order type
      const order = this.ccxtOrderToOrder(ccxtOrder);
      order.metadata = request.metadata;

      // Store in cache
      this.orders.set(order.id, order);

      // Emit creation event
      this.emitOrderUpdate(order, 'created');

      // Refresh balances after order
      this.fetchBalances().catch(err => {
        console.error('[CCXTTradingEngine] Failed to refresh balances:', err);
      });

      return order;
    } catch (error) {
      console.error('[CCXTTradingEngine] Order creation failed:', error);
      throw error;
    }
  }

  async cancelOrder(orderId: string, symbol?: string): Promise<Order> {
    if (!this.exchange) {
      throw new Error('Exchange not initialized');
    }

    try {
      // Cancel on exchange
      const ccxtOrder = await this.exchange.cancelOrder(orderId, symbol);

      // Update local cache
      const order = this.ccxtOrderToOrder(ccxtOrder);
      this.orders.set(order.id, order);

      // Emit cancellation event
      this.emitOrderUpdate(order, 'canceled');

      return order;
    } catch (error) {
      console.error('[CCXTTradingEngine] Order cancellation failed:', error);
      throw error;
    }
  }

  async getOrder(orderId: string, symbol?: string): Promise<Order> {
    if (!this.exchange) {
      throw new Error('Exchange not initialized');
    }

    try {
      const ccxtOrder = await this.exchange.fetchOrder(orderId, symbol);
      const order = this.ccxtOrderToOrder(ccxtOrder);
      
      // Update cache
      this.orders.set(order.id, order);
      
      return order;
    } catch (error) {
      // Try local cache
      const cachedOrder = this.orders.get(orderId);
      if (cachedOrder) return cachedOrder;
      
      throw error;
    }
  }

  async getOrders(symbol?: string, since?: Date, limit: number = 100): Promise<Order[]> {
    if (!this.exchange) {
      throw new Error('Exchange not initialized');
    }

    try {
      const ccxtOrders = await this.exchange.fetchOrders(
        symbol,
        since?.getTime(),
        limit
      );

      return ccxtOrders.map(o => this.ccxtOrderToOrder(o));
    } catch (error) {
      console.error('[CCXTTradingEngine] Failed to fetch orders:', error);
      throw error;
    }
  }

  async getOpenOrders(symbol?: string): Promise<Order[]> {
    if (!this.exchange) {
      throw new Error('Exchange not initialized');
    }

    try {
      const ccxtOrders = await this.exchange.fetchOpenOrders(symbol);
      return ccxtOrders.map(o => this.ccxtOrderToOrder(o));
    } catch (error) {
      console.error('[CCXTTradingEngine] Failed to fetch open orders:', error);
      throw error;
    }
  }

  async getPositions(symbols?: string[]): Promise<Position[]> {
    if (!this.exchange) {
      throw new Error('Exchange not initialized');
    }

    // Check if exchange supports positions (futures/derivatives)
    if (!this.exchange.has['fetchPositions']) {
      return []; // Spot trading doesn't have positions
    }

    try {
      const positions = await this.exchange.fetchPositions(symbols);
      
      return positions.map(pos => ({
        id: pos.id || `${pos.symbol}-${Date.now()}`,
        symbol: pos.symbol,
        exchange: this.account?.exchange || '',
        side: pos.side as 'long' | 'short',
        contracts: pos.contracts,
        entryPrice: pos.markPrice, // CCXT doesn't always provide entry price
        markPrice: pos.markPrice,
        liquidationPrice: pos.liquidationPrice,
        unrealizedPnl: pos.unrealizedPnl || 0,
        realizedPnl: pos.realizedPnl || 0,
        percentage: pos.percentage || 0,
        margin: pos.initialMargin,
        maintenanceMargin: pos.maintenanceMargin,
        marginRatio: pos.marginRatio,
        timestamp: new Date(pos.timestamp),
        lastUpdated: new Date()
      }));
    } catch (error) {
      console.error('[CCXTTradingEngine] Failed to fetch positions:', error);
      return [];
    }
  }

  async getPosition(symbol: string): Promise<Position | null> {
    const positions = await this.getPositions([symbol]);
    return positions.length > 0 ? positions[0] : null;
  }

  async closePosition(symbol: string, reduceOnly: boolean = true): Promise<Order> {
    const position = await this.getPosition(symbol);
    if (!position) {
      throw new Error(`No position found for ${symbol}`);
    }

    // Create market order to close position
    return this.createOrder({
      symbol: symbol,
      side: position.side === 'long' ? 'sell' : 'buy',
      type: 'market',
      quantity: position.contracts,
      reduceOnly
    });
  }

  async getBalances(): Promise<Balance[]> {
    if (!this.exchange) {
      throw new Error('Exchange not initialized');
    }

    await this.fetchBalances();
    return Array.from(this.balances.values());
  }

  async getBalance(currency: string): Promise<Balance | null> {
    if (!this.exchange) {
      throw new Error('Exchange not initialized');
    }

    await this.fetchBalances();
    return this.balances.get(currency) || null;
  }

  // Market data methods
  async getTicker(symbol: string): Promise<any> {
    if (!this.exchange) {
      throw new Error('Exchange not initialized');
    }

    try {
      return await this.exchange.fetchTicker(symbol);
    } catch (error) {
      console.error('[CCXTTradingEngine] Failed to fetch ticker:', error);
      throw error;
    }
  }

  async getOrderBook(symbol: string, limit: number = 20): Promise<any> {
    if (!this.exchange) {
      throw new Error('Exchange not initialized');
    }

    try {
      return await this.exchange.fetchOrderBook(symbol, limit);
    } catch (error) {
      console.error('[CCXTTradingEngine] Failed to fetch order book:', error);
      throw error;
    }
  }
}