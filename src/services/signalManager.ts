import { SignalLifecycle, SignalStatus, FilterResult, AnalysisResult, Strategy, MonitoringUpdate, Trade } from '../abstractions/interfaces';
import { ServiceFactory } from './serviceFactory';

export class SignalManager {
  private signals: Map<string, SignalLifecycle> = new Map();
  private updateCallbacks: Set<(signals: SignalLifecycle[]) => void> = new Set();
  
  // Create a new signal from a filter result
  createSignal(filterResult: FilterResult, strategyId: string, traderId?: string): SignalLifecycle {
    const signal: SignalLifecycle = {
      id: `${filterResult.symbol}-${Date.now()}`,
      symbol: filterResult.symbol,
      strategyId,
      traderId, // Add trader attribution
      createdAt: new Date(),
      matchedConditions: filterResult.matchedConditions,
      initialPrice: filterResult.price,
      status: 'new',
      currentPrice: filterResult.price,
      priceChange: 0,
    };
    
    this.signals.set(signal.id, signal);
    this.notifyUpdate();
    return signal;
  }
  
  // Update signal with analysis results
  updateWithAnalysis(signalId: string, analysis: AnalysisResult) {
    const signal = this.signals.get(signalId);
    if (!signal) return;
    
    signal.analysis = analysis;
    signal.analyzedAt = new Date();
    
    // Update status based on analysis decision
    switch (analysis.decision) {
      case 'no_trade':
        signal.status = 'rejected';
        break;
      case 'monitor':
        signal.status = 'monitoring';
        signal.monitoringStarted = new Date();
        signal.monitoringUpdates = [];
        break;
      case 'buy':
      case 'sell':
        signal.status = 'ready';
        signal.direction = analysis.direction || (analysis.decision === 'buy' ? 'long' : 'short');
        break;
      case 'hold':
        signal.status = 'monitoring';
        break;
      // Handle legacy decisions for backwards compatibility
      case 'bad_setup':
        signal.status = 'rejected';
        break;
      case 'good_setup':
        signal.status = 'monitoring';
        signal.monitoringStarted = new Date();
        signal.monitoringUpdates = [];
        break;
      case 'enter_trade':
        signal.status = 'ready';
        break;
    }
    
    this.notifyUpdate();
  }
  
  // Update signal with re-analysis results (for monitoring/in_position signals)
  updateReanalysis(signalId: string, analysis: AnalysisResult) {
    const signal = this.signals.get(signalId);
    if (!signal) return;
    
    // Update the analysis result with the latest
    signal.analysis = analysis;
    signal.analyzedAt = new Date();
    
    // Only update status if the decision changes from monitoring to ready
    if (signal.status === 'monitoring' && analysis.decision === 'enter_trade') {
      signal.status = 'ready';
    }
    
    this.notifyUpdate();
  }
  
  // Add monitoring update
  addMonitoringUpdate(signalId: string, update: MonitoringUpdate) {
    const signal = this.signals.get(signalId);
    if (!signal || (signal.status !== 'monitoring' && signal.status !== 'in_position')) return;
    
    if (!signal.monitoringUpdates) {
      signal.monitoringUpdates = [];
    }
    signal.monitoringUpdates.push(update);
    
    // Update status if action is enter or cancel
    if (update.action === 'enter') {
      signal.status = 'ready';
    } else if (update.action === 'cancel') {
      signal.status = 'expired';
    }
    
    this.notifyUpdate();
  }
  
  // Update signal with trade
  updateWithTrade(signalId: string, trade: Trade) {
    const signal = this.signals.get(signalId);
    if (!signal) return;
    
    signal.trade = trade;
    signal.status = trade.status === 'active' ? 'in_position' : 'closed';
    
    if (trade.status === 'closed' && trade.pnl) {
      signal.realizedPnl = trade.pnl;
    }
    
    this.notifyUpdate();
  }
  
  // Update current price and calculate unrealized PnL
  updatePrice(symbol: string, currentPrice: number) {
    let updated = false;
    
    this.signals.forEach(signal => {
      if (signal.symbol === symbol) {
        signal.currentPrice = currentPrice;
        signal.priceChange = ((currentPrice - signal.initialPrice) / signal.initialPrice) * 100;
        
        // Calculate unrealized PnL if in position
        if (signal.status === 'in_position' && signal.trade && signal.trade.entryPrice) {
          const direction = signal.trade.direction === 'long' ? 1 : -1;
          const priceDiff = (currentPrice - signal.trade.entryPrice) * direction;
          signal.unrealizedPnl = (priceDiff / signal.trade.entryPrice) * 100;
        }
        
        updated = true;
      }
    });
    
    if (updated) {
      this.notifyUpdate();
    }
  }
  
  // Get signals for display
  getSignals(filters?: {
    strategyId?: string;
    traderId?: string; // NEW: Filter by trader
    status?: SignalStatus[];
    symbol?: string;
  }): SignalLifecycle[] {
    let signals = Array.from(this.signals.values());
    
    if (filters?.strategyId) {
      signals = signals.filter(s => s.strategyId === filters.strategyId);
    }
    
    if (filters?.traderId) {
      signals = signals.filter(s => s.traderId === filters.traderId);
    }
    
    if (filters?.status) {
      signals = signals.filter(s => filters.status!.includes(s.status));
    }
    
    if (filters?.symbol) {
      signals = signals.filter(s => s.symbol === filters.symbol);
    }
    
    // Sort by creation date, newest first
    return signals.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  
  // Get signal by ID
  getSignal(signalId: string): SignalLifecycle | undefined {
    return this.signals.get(signalId);
  }
  
  // Alias for consistency
  getSignalById(signalId: string): SignalLifecycle | undefined {
    return this.signals.get(signalId);
  }
  
  // Update signal status
  updateSignalStatus(signalId: string, status: SignalStatus) {
    const signal = this.signals.get(signalId);
    if (!signal) return;
    
    signal.status = status;
    
    // Set timestamps based on status changes
    if (status === 'monitoring' && !signal.monitoringStarted) {
      signal.monitoringStarted = new Date();
      signal.monitoringUpdates = [];
    }
    
    this.notifyUpdate();
  }
  
  // Subscribe to signal updates
  subscribe(callback: (signals: SignalLifecycle[]) => void): () => void {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
  }
  
  // Clear old signals
  cleanupOldSignals(maxAge: number = 24 * 60 * 60 * 1000) { // 24 hours default
    const cutoff = Date.now() - maxAge;
    let removed = false;
    
    this.signals.forEach((signal, id) => {
      if (signal.createdAt.getTime() < cutoff && 
          (signal.status === 'rejected' || signal.status === 'expired' || signal.status === 'closed')) {
        this.signals.delete(id);
        removed = true;
      }
    });
    
    if (removed) {
      this.notifyUpdate();
    }
  }
  
  private notifyUpdate() {
    const signals = this.getSignals();
    this.updateCallbacks.forEach(callback => {
      try {
        callback(signals);
      } catch (error) {
        console.error('Signal update callback error:', error);
      }
    });
  }
}

// Singleton instance
export const signalManager = new SignalManager();