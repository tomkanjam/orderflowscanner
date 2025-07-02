import { ITradingEngine, TradingMode, OrderRequest, Order } from '../abstractions/trading.interfaces';
import { DemoTradingEngine } from '../implementations/trading/DemoTradingEngine';
import { CCXTTradingEngine } from '../implementations/trading/CCXTTradingEngine';
import { exchangeAccountManager } from './exchangeAccountManager';
import { signalManager } from './signalManager';
import { SignalLifecycle } from '../abstractions/interfaces';
import { Ticker } from '../../types';

export interface TradingConfig {
  mode: 'demo' | 'live';
  accountId?: string; // Required for live mode
  autoExecute: boolean; // Whether to auto-execute signals
  riskPerTrade: number; // Risk per trade as percentage of account
  maxOpenPositions: number;
}

export class TradingManager {
  private static instance: TradingManager;
  private engine: ITradingEngine | null = null;
  private config: TradingConfig = {
    mode: 'demo',
    autoExecute: false,
    riskPerTrade: 1, // 1% risk per trade
    maxOpenPositions: 5
  };
  private initialized = false;

  private constructor() {}

  static getInstance(): TradingManager {
    if (!TradingManager.instance) {
      TradingManager.instance = new TradingManager();
    }
    return TradingManager.instance;
  }

  async initialize(config?: Partial<TradingConfig>): Promise<void> {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Load saved config
    const saved = localStorage.getItem('tradingConfig');
    if (saved && !config) {
      try {
        this.config = JSON.parse(saved);
      } catch (error) {
        console.error('[TradingManager] Failed to load saved config:', error);
      }
    }

    // Initialize exchange account manager
    await exchangeAccountManager.initialize();

    // Initialize trading engine
    await this.initializeEngine();

    // Subscribe to signal updates for auto-execution
    this.setupSignalSubscription();

    this.initialized = true;
    console.log(`[TradingManager] Initialized in ${this.config.mode} mode`);
  }

  private async initializeEngine(): Promise<void> {
    // Shutdown existing engine if any
    if (this.engine) {
      await this.engine.shutdown();
      this.engine = null;
    }

    if (this.config.mode === 'demo') {
      this.engine = new DemoTradingEngine();
    } else {
      if (!this.config.accountId) {
        throw new Error('Account ID required for live trading');
      }

      const account = exchangeAccountManager.getAccount(this.config.accountId);
      if (!account) {
        throw new Error(`Account ${this.config.accountId} not found`);
      }

      this.engine = new CCXTTradingEngine(account);
    }

    await this.engine.initialize();

    // Set up event listeners
    this.engine.on('order', (update) => {
      console.log('[TradingManager] Order update:', update);
      // Could emit to UI or store in database
    });

    this.engine.on('position', (update) => {
      console.log('[TradingManager] Position update:', update);
      // Update signal manager with position status
    });

    this.engine.on('error', (error) => {
      console.error('[TradingManager] Trading engine error:', error);
    });
  }

  private setupSignalSubscription(): void {
    signalManager.subscribe(async (signals) => {
      if (!this.config.autoExecute || !this.engine) return;

      // Check for signals that are ready to trade
      const readySignals = signals.filter(s => s.status === 'ready' && !s.trade);

      for (const signal of readySignals) {
        try {
          await this.executeSignal(signal);
        } catch (error) {
          console.error(`[TradingManager] Failed to execute signal ${signal.id}:`, error);
        }
      }
    });
  }

  async switchMode(mode: 'demo' | 'live', accountId?: string): Promise<void> {
    if (mode === 'live' && !accountId) {
      throw new Error('Account ID required for live trading');
    }

    this.config.mode = mode;
    this.config.accountId = accountId;

    // Save config
    localStorage.setItem('tradingConfig', JSON.stringify(this.config));

    // Reinitialize engine
    await this.initializeEngine();

    console.log(`[TradingManager] Switched to ${mode} mode`);
  }

  async setAutoExecute(enabled: boolean): Promise<void> {
    this.config.autoExecute = enabled;
    localStorage.setItem('tradingConfig', JSON.stringify(this.config));
    console.log(`[TradingManager] Auto-execute ${enabled ? 'enabled' : 'disabled'}`);
  }

  async executeSignal(signal: SignalLifecycle): Promise<Order> {
    if (!this.engine) {
      throw new Error('Trading engine not initialized');
    }

    if (!signal.analysis || !signal.analysis.tradePlan) {
      throw new Error('Signal missing analysis or trade plan');
    }

    const { tradePlan } = signal.analysis;

    // Calculate position size based on risk
    const positionSize = await this.calculatePositionSize(
      signal.symbol,
      tradePlan.entry,
      tradePlan.stopLoss,
      this.config.riskPerTrade
    );

    // Create order request
    const orderRequest: OrderRequest = {
      symbol: signal.symbol,
      side: signal.direction === 'long' ? 'buy' : 'sell',
      type: 'market', // Start with market orders
      quantity: positionSize,
      metadata: {
        signalId: signal.id,
        strategyId: signal.strategyId,
        traderId: signal.traderId
      }
    };

    // Execute order
    const order = await this.engine.createOrder(orderRequest);

    // Update signal with trade info
    signalManager.updateWithTrade(signal.id, {
      id: order.id,
      signalId: signal.id,
      symbol: signal.symbol,
      direction: signal.direction || 'long',
      entryPrice: order.averagePrice || order.price || 0,
      entryTime: order.timestamp,
      quantity: order.quantity,
      status: 'active'
    });

    // Create stop loss order
    if (tradePlan.stopLoss) {
      try {
        await this.createStopLoss(signal.symbol, signal.direction!, positionSize, tradePlan.stopLoss);
      } catch (error) {
        console.error('[TradingManager] Failed to create stop loss:', error);
      }
    }

    // Create take profit order
    if (tradePlan.takeProfit) {
      try {
        await this.createTakeProfit(signal.symbol, signal.direction!, positionSize, tradePlan.takeProfit);
      } catch (error) {
        console.error('[TradingManager] Failed to create take profit:', error);
      }
    }

    return order;
  }

  private async calculatePositionSize(
    symbol: string,
    entryPrice: number,
    stopLoss: number,
    riskPercent: number
  ): Promise<number> {
    if (!this.engine) {
      throw new Error('Trading engine not initialized');
    }

    // Get account balance
    const balances = await this.engine.getBalances();
    const usdtBalance = balances.find(b => b.currency === 'USDT');
    
    if (!usdtBalance) {
      throw new Error('No USDT balance available');
    }

    // Calculate risk amount
    const riskAmount = (usdtBalance.total * riskPercent) / 100;

    // Calculate position size
    const stopDistance = Math.abs(entryPrice - stopLoss);
    const positionValue = riskAmount / (stopDistance / entryPrice);
    const positionSize = positionValue / entryPrice;

    // Round to appropriate decimals (this should be based on exchange's lot size)
    // Ensure minimum position size of 0.001 to avoid 0 quantity errors
    const roundedSize = Math.floor(positionSize * 1000) / 1000;
    return Math.max(roundedSize, 0.001);
  }

  private async createStopLoss(
    symbol: string,
    direction: 'long' | 'short',
    quantity: number,
    stopPrice: number
  ): Promise<Order> {
    if (!this.engine) {
      throw new Error('Trading engine not initialized');
    }

    return this.engine.createOrder({
      symbol,
      side: direction === 'long' ? 'sell' : 'buy',
      type: 'stop',
      quantity,
      stopPrice,
      reduceOnly: true
    });
  }

  private async createTakeProfit(
    symbol: string,
    direction: 'long' | 'short',
    quantity: number,
    takePrice: number
  ): Promise<Order> {
    if (!this.engine) {
      throw new Error('Trading engine not initialized');
    }

    return this.engine.createOrder({
      symbol,
      side: direction === 'long' ? 'sell' : 'buy',
      type: 'limit',
      quantity,
      price: takePrice,
      reduceOnly: true
    });
  }

  // Update market prices for demo engine
  updateMarketPrices(tickers: Map<string, Ticker>): void {
    if (this.engine && this.config.mode === 'demo') {
      const demoEngine = this.engine as DemoTradingEngine;
      tickers.forEach((ticker, symbol) => {
        demoEngine.updateMarketPrice(symbol, ticker);
      });
    }
  }

  // Getters for UI
  getConfig(): TradingConfig {
    return { ...this.config };
  }

  getEngine(): ITradingEngine | null {
    return this.engine;
  }

  isLiveMode(): boolean {
    return this.config.mode === 'live';
  }

  isAutoExecuteEnabled(): boolean {
    return this.config.autoExecute;
  }

  async shutdown(): Promise<void> {
    if (this.engine) {
      await this.engine.shutdown();
      this.engine = null;
    }
    this.initialized = false;
  }
}

export const tradingManager = TradingManager.getInstance();