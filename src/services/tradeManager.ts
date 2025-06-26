import { Trade, SignalLifecycle } from '../abstractions/interfaces';
import { signalManager } from './signalManager';

export class TradeManager {
  private trades: Map<string, Trade> = new Map();
  private updateCallbacks: Set<(trades: Trade[]) => void> = new Set();
  
  // Execute a new trade
  async executeTrade(
    signalId: string,
    tradeData: Omit<Trade, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ): Promise<Trade> {
    const trade: Trade = {
      ...tradeData,
      id: `trade-${Date.now()}`,
      userId: 'demo-user', // Would come from auth
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    // Store trade
    this.trades.set(trade.id, trade);
    
    // Update signal with trade
    signalManager.updateWithTrade(signalId, trade);
    
    // Notify subscribers
    this.notifyUpdate();
    
    // In a real implementation, this would:
    // 1. Submit order to exchange API
    // 2. Wait for fill confirmation
    // 3. Update trade with actual fill price
    console.log('Trade executed:', trade);
    
    return trade;
  }
  
  // Close a trade
  async closeTrade(
    tradeId: string,
    closeReason: string,
    closePrice: number
  ): Promise<Trade> {
    const trade = this.trades.get(tradeId);
    if (!trade) {
      throw new Error('Trade not found');
    }
    
    // Calculate final P&L
    const entryPrice = trade.entryPrice || 0;
    const direction = trade.direction === 'long' ? 1 : -1;
    const priceDiff = (closePrice - entryPrice) * direction;
    const pnl = priceDiff * (trade.positionSize || 0) / entryPrice;
    const pnlPercentage = (priceDiff / entryPrice) * 100;
    
    // Update trade
    const updatedTrade: Trade = {
      ...trade,
      status: 'closed',
      currentPrice: closePrice,
      closedAt: new Date(),
      closeReason,
      pnl,
      pnlPercentage,
      updatedAt: new Date(),
    };
    
    this.trades.set(tradeId, updatedTrade);
    
    // Update signal
    const signal = this.findSignalByTradeId(tradeId);
    if (signal) {
      signalManager.updateWithTrade(signal.id, updatedTrade);
    }
    
    // Notify subscribers
    this.notifyUpdate();
    
    // In a real implementation, this would submit close order to exchange
    console.log('Trade closed:', updatedTrade);
    
    return updatedTrade;
  }
  
  // Modify a trade (update SL/TP)
  async modifyTrade(
    tradeId: string,
    updates: Partial<Trade>
  ): Promise<Trade> {
    const trade = this.trades.get(tradeId);
    if (!trade) {
      throw new Error('Trade not found');
    }
    
    // Only allow certain fields to be modified
    const allowedUpdates = {
      stopLoss: updates.stopLoss,
      takeProfit: updates.takeProfit,
    };
    
    const updatedTrade: Trade = {
      ...trade,
      ...allowedUpdates,
      updatedAt: new Date(),
    };
    
    this.trades.set(tradeId, updatedTrade);
    
    // Update signal
    const signal = this.findSignalByTradeId(tradeId);
    if (signal) {
      signalManager.updateWithTrade(signal.id, updatedTrade);
    }
    
    // Notify subscribers
    this.notifyUpdate();
    
    // In a real implementation, this would update orders on exchange
    console.log('Trade modified:', updatedTrade);
    
    return updatedTrade;
  }
  
  // Update current price for all trades
  updatePrice(symbol: string, currentPrice: number) {
    let updated = false;
    
    this.trades.forEach(trade => {
      if (trade.symbol === symbol && trade.status === 'active') {
        trade.currentPrice = currentPrice;
        trade.updatedAt = new Date();
        
        // Check if stop loss hit
        if (trade.stopLoss) {
          const hitStopLoss = trade.direction === 'long' 
            ? currentPrice <= trade.stopLoss
            : currentPrice >= trade.stopLoss;
            
          if (hitStopLoss) {
            console.log(`Stop loss hit for ${symbol} at ${currentPrice}`);
            // In real implementation, would auto-close
          }
        }
        
        // Check if take profit hit
        if (trade.takeProfit && trade.takeProfit[0]) {
          const hitTakeProfit = trade.direction === 'long'
            ? currentPrice >= trade.takeProfit[0]
            : currentPrice <= trade.takeProfit[0];
            
          if (hitTakeProfit) {
            console.log(`Take profit hit for ${symbol} at ${currentPrice}`);
            // In real implementation, would auto-close or partial close
          }
        }
        
        updated = true;
      }
    });
    
    if (updated) {
      this.notifyUpdate();
    }
  }
  
  // Get all trades
  getTrades(filters?: {
    status?: Trade['status'];
    symbol?: string;
    strategyId?: string;
  }): Trade[] {
    let trades = Array.from(this.trades.values());
    
    if (filters?.status) {
      trades = trades.filter(t => t.status === filters.status);
    }
    
    if (filters?.symbol) {
      trades = trades.filter(t => t.symbol === filters.symbol);
    }
    
    if (filters?.strategyId) {
      trades = trades.filter(t => t.strategyId === filters.strategyId);
    }
    
    return trades.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  
  // Get trade by ID
  getTrade(tradeId: string): Trade | undefined {
    return this.trades.get(tradeId);
  }
  
  // Calculate portfolio metrics
  getPortfolioMetrics(): {
    totalPnL: number;
    totalPnLPercent: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    openPositions: number;
    closedTrades: number;
  } {
    const allTrades = Array.from(this.trades.values());
    const closedTrades = allTrades.filter(t => t.status === 'closed');
    const openTrades = allTrades.filter(t => t.status === 'active');
    
    const wins = closedTrades.filter(t => (t.pnlPercentage || 0) > 0);
    const losses = closedTrades.filter(t => (t.pnlPercentage || 0) < 0);
    
    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalPnLPercent = closedTrades.length > 0
      ? closedTrades.reduce((sum, t) => sum + (t.pnlPercentage || 0), 0) / closedTrades.length
      : 0;
    
    const winRate = closedTrades.length > 0 
      ? (wins.length / closedTrades.length) * 100 
      : 0;
      
    const avgWin = wins.length > 0
      ? wins.reduce((sum, t) => sum + (t.pnlPercentage || 0), 0) / wins.length
      : 0;
      
    const avgLoss = losses.length > 0
      ? losses.reduce((sum, t) => sum + (t.pnlPercentage || 0), 0) / losses.length
      : 0;
    
    return {
      totalPnL,
      totalPnLPercent,
      winRate,
      avgWin,
      avgLoss,
      openPositions: openTrades.length,
      closedTrades: closedTrades.length,
    };
  }
  
  // Subscribe to trade updates
  subscribe(callback: (trades: Trade[]) => void): () => void {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
  }
  
  private findSignalByTradeId(tradeId: string): SignalLifecycle | undefined {
    const signals = signalManager.getSignals();
    return signals.find(s => s.trade?.id === tradeId);
  }
  
  private notifyUpdate() {
    const trades = this.getTrades();
    this.updateCallbacks.forEach(callback => {
      try {
        callback(trades);
      } catch (error) {
        console.error('Trade update callback error:', error);
      }
    });
  }
}

// Singleton instance
export const tradeManager = new TradeManager();