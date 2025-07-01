import { 
  IMonitoringEngine, 
  SignalLifecycle, 
  Strategy, 
  MonitoringUpdate 
} from '../../abstractions/interfaces';
import { ServiceFactory } from '../../services/serviceFactory';
import { binanceService } from '../../services/binanceService';

export class BrowserMonitoringEngine implements IMonitoringEngine {
  private isActive = false;
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private updateCallbacks: Set<(signalId: string, update: MonitoringUpdate) => void> = new Set();
  private userId: string | null = null;
  
  async startMonitoring(userId: string): Promise<void> {
    if (this.isActive) return;
    
    this.isActive = true;
    this.userId = userId;
    
    // In browser implementation, monitoring is handled per-signal
    // This just sets the engine as active
    console.log('Monitoring engine started for user:', userId);
  }
  
  async stopMonitoring(userId: string): Promise<void> {
    if (!this.isActive || this.userId !== userId) return;
    
    this.isActive = false;
    this.userId = null;
    
    // Clear all monitoring intervals
    this.monitoringIntervals.forEach(interval => clearInterval(interval));
    this.monitoringIntervals.clear();
    
    console.log('Monitoring engine stopped');
  }
  
  async monitorSignal(signal: SignalLifecycle, strategy: Strategy): Promise<MonitoringUpdate> {
    if (!this.isActive) {
      throw new Error('Monitoring engine is not active');
    }
    
    try {
      // Get current market data
      const klines = await this.fetchLatestKlines(signal.symbol);
      const marketData = {
        symbol: signal.symbol,
        price: signal.currentPrice,
        volume: 0, // Would get from ticker
        klines,
      };
      
      // Re-analyze with current data
      const analysisEngine = ServiceFactory.getAnalysis();
      const result = await analysisEngine.analyzeSetup(
        signal.symbol,
        strategy,
        marketData,
        undefined,
        'gemini-2.5-flash' // Use fast model for monitoring
      );
      
      // Determine action based on analysis
      let action: 'continue' | 'enter' | 'cancel' = 'continue';
      let reason = result.reasoning;
      
      if (result.decision === 'enter_trade') {
        action = 'enter';
        reason = `Entry signal confirmed: ${result.reasoning}`;
      } else if (result.decision === 'bad_setup') {
        action = 'cancel';
        reason = `Setup invalidated: ${result.reasoning}`;
      } else {
        // Check if price has moved too far from initial
        const priceChange = Math.abs(signal.priceChange);
        if (priceChange > 5) { // More than 5% move
          action = 'cancel';
          reason = `Price moved ${priceChange.toFixed(2)}% from signal entry`;
        }
      }
      
      const update: MonitoringUpdate = {
        timestamp: new Date(),
        price: signal.currentPrice,
        action,
        reason,
        confidence: result.confidence,
      };
      
      // Notify callbacks
      this.updateCallbacks.forEach(callback => {
        try {
          callback(signal.id, update);
        } catch (error) {
          console.error('Monitoring callback error:', error);
        }
      });
      
      return update;
    } catch (error) {
      console.error('Monitoring error:', error);
      throw error;
    }
  }
  
  getMonitoringStatus(userId: string): { isActive: boolean; signalsMonitored: number } {
    return {
      isActive: this.isActive && this.userId === userId,
      signalsMonitored: this.monitoringIntervals.size,
    };
  }
  
  subscribeToUpdates(
    callback: (signalId: string, update: MonitoringUpdate) => void
  ): () => void {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
  }
  
  // Start continuous monitoring for a specific signal
  startSignalMonitoring(
    signal: SignalLifecycle, 
    strategy: Strategy, 
    intervalMs: number = 30000 // 30 seconds default
  ) {
    if (!this.isActive) return;
    
    // Clear existing interval if any
    this.stopSignalMonitoring(signal.id);
    
    // Monitor immediately
    this.monitorSignal(signal, strategy).catch(console.error);
    
    // Set up interval
    const interval = setInterval(async () => {
      try {
        await this.monitorSignal(signal, strategy);
      } catch (error) {
        console.error(`Monitoring error for ${signal.symbol}:`, error);
      }
    }, intervalMs);
    
    this.monitoringIntervals.set(signal.id, interval);
  }
  
  // Stop monitoring a specific signal
  stopSignalMonitoring(signalId: string) {
    const interval = this.monitoringIntervals.get(signalId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(signalId);
    }
  }
  
  private async fetchLatestKlines(symbol: string, limit: number = 100): Promise<any[]> {
    // In a real implementation, this would fetch from binanceService
    // For now, return empty array
    console.log('Would fetch klines for:', symbol);
    return [];
  }
}