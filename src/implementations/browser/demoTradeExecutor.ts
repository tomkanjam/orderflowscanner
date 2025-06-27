import { v4 as uuidv4 } from 'uuid';
import {
  ITradeExecutor,
  TradeRequest,
  TradeResult,
  Position,
  Order,
  Balance,
  OrderUpdate,
} from '../../abstractions/trader.interfaces';

export class DemoTradeExecutor implements ITradeExecutor {
  private positions: Map<string, Position> = new Map();
  private orders: Map<string, Order> = new Map();
  private balance: Balance = {
    asset: 'USDT',
    free: 10000, // Start with $10,000 demo balance
    locked: 0,
    total: 10000,
  };
  private executedTrades: TradeResult[] = [];

  async executeTrade(trade: TradeRequest): Promise<TradeResult> {
    const orderId = uuidv4();
    const now = new Date();

    // Simulate market order execution
    if (trade.type === 'market') {
      // For demo, assume market orders are filled immediately at current price
      const executedPrice = trade.price || 0; // In real implementation, get from ticker
      const executedQty = trade.quantity;
      
      // Calculate commission (0.1% like Binance)
      const commission = executedQty * executedPrice * 0.001;
      
      // Update balance
      if (trade.side === 'buy') {
        const cost = executedQty * executedPrice + commission;
        if (this.balance.free < cost) {
          throw new Error('Insufficient balance');
        }
        this.balance.free -= cost;
        
        // Create or update position
        const existingPosition = this.positions.get(trade.symbol);
        if (existingPosition) {
          // Average up/down
          const totalQty = existingPosition.quantity + executedQty;
          const totalCost = (existingPosition.quantity * existingPosition.entryPrice) + (executedQty * executedPrice);
          existingPosition.quantity = totalQty;
          existingPosition.entryPrice = totalCost / totalQty;
        } else {
          this.positions.set(trade.symbol, {
            symbol: trade.symbol,
            quantity: executedQty,
            entryPrice: executedPrice,
            currentPrice: executedPrice,
            pnl: 0,
            pnlPercent: 0,
            openTime: now,
          });
        }
      } else {
        // Sell
        const position = this.positions.get(trade.symbol);
        if (!position || position.quantity < executedQty) {
          throw new Error('Insufficient position');
        }
        
        const proceeds = executedQty * executedPrice - commission;
        this.balance.free += proceeds;
        
        // Update or close position
        position.quantity -= executedQty;
        if (position.quantity === 0) {
          this.positions.delete(trade.symbol);
        }
      }

      const result: TradeResult = {
        orderId,
        status: 'filled',
        executedQty,
        executedPrice,
        commission,
        commissionAsset: 'USDT',
        transactTime: now,
        mode: 'demo',
      };

      this.executedTrades.push(result);
      return result;
    }

    // For limit orders, add to order book
    const order: Order = {
      orderId,
      symbol: trade.symbol,
      side: trade.side,
      type: trade.type,
      quantity: trade.quantity,
      price: trade.price,
      status: 'pending',
      createdAt: now,
    };

    this.orders.set(orderId, order);

    // Return pending result
    return {
      orderId,
      status: 'pending',
      executedQty: 0,
      executedPrice: 0,
      transactTime: now,
      mode: 'demo',
    };
  }

  async cancelOrder(orderId: string): Promise<void> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status !== 'pending') {
      throw new Error('Order cannot be cancelled');
    }

    order.status = 'cancelled';
    this.orders.delete(orderId);
  }

  async modifyOrder(orderId: string, updates: OrderUpdate): Promise<TradeResult> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status !== 'pending') {
      throw new Error('Order cannot be modified');
    }

    // Update order
    if (updates.quantity !== undefined) order.quantity = updates.quantity;
    if (updates.price !== undefined) order.price = updates.price;

    // Return updated status
    return {
      orderId,
      status: 'pending',
      executedQty: 0,
      executedPrice: 0,
      transactTime: new Date(),
      mode: 'demo',
    };
  }

  async getPosition(symbol: string): Promise<Position | null> {
    return this.positions.get(symbol) || null;
  }

  async getOpenOrders(symbol?: string): Promise<Order[]> {
    const orders = Array.from(this.orders.values());
    if (symbol) {
      return orders.filter(o => o.symbol === symbol && o.status === 'pending');
    }
    return orders.filter(o => o.status === 'pending');
  }

  async getBalance(): Promise<Balance> {
    return { ...this.balance };
  }

  // Additional demo-specific methods
  updatePrice(symbol: string, currentPrice: number): void {
    const position = this.positions.get(symbol);
    if (position) {
      position.currentPrice = currentPrice;
      const pnl = (currentPrice - position.entryPrice) * position.quantity;
      position.pnl = pnl;
      position.pnlPercent = (pnl / (position.entryPrice * position.quantity)) * 100;
    }

    // Check limit orders
    this.orders.forEach(order => {
      if (order.symbol === symbol && order.status === 'pending') {
        // Simple limit order execution logic
        if (order.type === 'limit') {
          if (
            (order.side === 'buy' && order.price && currentPrice <= order.price) ||
            (order.side === 'sell' && order.price && currentPrice >= order.price)
          ) {
            // Execute the limit order
            this.executeTrade({
              ...order,
              type: 'market',
              price: currentPrice,
              traderId: '', // Would be provided in real implementation
              signalId: '',
            }).then(() => {
              order.status = 'filled';
              this.orders.delete(order.orderId);
            });
          }
        }
      }
    });
  }

  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  getTradeHistory(): TradeResult[] {
    return [...this.executedTrades];
  }

  getTotalPnL(): { realized: number; unrealized: number; total: number } {
    let unrealized = 0;
    this.positions.forEach(position => {
      unrealized += position.pnl;
    });

    // Calculate realized P&L from closed trades
    let realized = 0;
    // This would track closed positions in a real implementation

    return {
      realized,
      unrealized,
      total: realized + unrealized,
    };
  }

  reset(): void {
    this.positions.clear();
    this.orders.clear();
    this.executedTrades = [];
    this.balance = {
      asset: 'USDT',
      free: 10000,
      locked: 0,
      total: 10000,
    };
  }
}