// Core interfaces for TradeMind services
// Designed for easy migration from browser to cloud

export interface Strategy {
  id: string;
  userId: string;
  name: string;
  description: string; // Natural language strategy
  filterCode: string; // Generated filter code
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WatchlistItem {
  id: string;
  userId: string;
  strategyId: string;
  symbol: string;
  decision: 'bad_setup' | 'good_setup' | 'monitoring' | 'entered';
  reasoning: string;
  confidence: number;
  analysis: AnalysisResult;
  keyLevels?: KeyLevels;
  createdAt: Date;
  updatedAt: Date;
}

export interface Trade {
  id: string;
  userId: string;
  strategyId: string;
  watchlistId?: string;
  symbol: string;
  direction: 'long' | 'short';
  entryPrice?: number;
  currentPrice?: number;
  stopLoss?: number;
  takeProfit?: number[];
  positionSize?: number;
  tradePlan: string;
  status: 'planned' | 'active' | 'closed';
  closedAt?: Date;
  pnl?: number;
  pnlPercentage?: number;
  closeReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Alert {
  id: string;
  userId: string;
  watchlistId?: string;
  tradeId?: string;
  type: 'setup_ready' | 'enter_trade' | 'stop_loss' | 'take_profit' | 'strategy_update';
  message: string;
  isRead: boolean;
  createdAt: Date;
}

export interface AnalysisResult {
  decision: 'bad_setup' | 'good_setup' | 'enter_trade';
  direction?: 'long' | 'short';
  confidence: number;
  reasoning: string;
  keyLevels?: KeyLevels;
  chartAnalysis?: string; // Multi-modal chart interpretation
  technicalIndicators?: Record<string, any>;
  timestamp: Date;
}

export interface KeyLevels {
  entry?: number;
  stopLoss?: number;
  takeProfit?: number[];
  support?: number[];
  resistance?: number[];
}

export interface FilterResult {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  matchedConditions: string[];
}

// Unified Signal Lifecycle Types
export type SignalStatus = 
  | 'new'           // Just matched filter
  | 'analyzing'     // AI analysis in progress
  | 'rejected'      // AI said bad_setup
  | 'monitoring'    // AI said good_setup, watching for entry
  | 'ready'         // AI said enter_trade but not executed
  | 'in_position'   // Trade is active
  | 'closed'        // Trade closed
  | 'expired';      // Signal expired without action

export interface SignalLifecycle {
  id: string;
  symbol: string;
  strategyId: string;
  traderId?: string; // NEW: Reference to the trader that created this signal
  
  // Signal creation
  createdAt: Date;
  matchedConditions: string[];
  initialPrice: number;
  
  // Current state
  status: SignalStatus;
  currentPrice: number;
  priceChange: number; // % from initial
  
  // Analysis results
  analysis?: AnalysisResult;
  analyzedAt?: Date;
  
  // Monitoring data
  monitoringStarted?: Date;
  monitoringUpdates?: MonitoringUpdate[];
  
  // Trade data
  trade?: Trade;
  
  // Performance
  unrealizedPnl?: number;
  realizedPnl?: number;
}

export interface MonitoringUpdate {
  timestamp: Date;
  price: number;
  action: 'continue' | 'enter' | 'cancel';
  reason: string;
  confidence?: number;
}

export interface MarketData {
  symbol: string;
  price: number;
  volume: number;
  klines: any[];
  // Add other market data fields as needed
}

// Service Interfaces

export interface IPersistenceService {
  // User management
  getCurrentUser(): Promise<{ id: string; email: string; tier: string } | null>;
  
  // Strategy management
  saveStrategy(strategy: Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>): Promise<Strategy>;
  updateStrategy(id: string, updates: Partial<Strategy>): Promise<Strategy>;
  getStrategies(userId: string): Promise<Strategy[]>;
  getStrategy(id: string): Promise<Strategy | null>;
  deleteStrategy(id: string): Promise<void>;
  
  // Watchlist management
  addToWatchlist(item: Omit<WatchlistItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<WatchlistItem>;
  updateWatchlistItem(id: string, updates: Partial<WatchlistItem>): Promise<WatchlistItem>;
  getWatchlist(userId: string, strategyId?: string): Promise<WatchlistItem[]>;
  removeFromWatchlist(id: string): Promise<void>;
  
  // Trade management
  createTrade(trade: Omit<Trade, 'id' | 'createdAt' | 'updatedAt'>): Promise<Trade>;
  updateTrade(id: string, updates: Partial<Trade>): Promise<Trade>;
  getTrades(userId: string, status?: Trade['status']): Promise<Trade[]>;
  closeTrade(id: string, closeReason: string, pnl: number, pnlPercentage: number): Promise<Trade>;
  
  // Alert management
  createAlert(alert: Omit<Alert, 'id' | 'createdAt'>): Promise<Alert>;
  getAlerts(userId: string, unreadOnly?: boolean): Promise<Alert[]>;
  markAlertAsRead(id: string): Promise<void>;
  markAllAlertsAsRead(userId: string): Promise<void>;
}

export interface IScreenerEngine {
  executeFilter(filterCode: string, marketData: Map<string, MarketData>): Promise<FilterResult[]>;
  validateFilterCode(filterCode: string): Promise<{ valid: boolean; error?: string }>;
  subscribeToUpdates(callback: (data: MarketData) => void): () => void; // Returns unsubscribe function
}

export interface IAnalysisEngine {
  analyzeSetup(symbol: string, strategy: Strategy, marketData: MarketData, chartImage?: Blob, modelName?: string): Promise<AnalysisResult>;
  generateTradeDecision(analysis: AnalysisResult): TradeDecision;
  validateAnalysis(analysis: AnalysisResult): boolean;
}

export interface IMonitoringEngine {
  startMonitoring(userId: string): Promise<void>;
  stopMonitoring(userId: string): Promise<void>;
  monitorSignal(signal: SignalLifecycle, strategy: Strategy): Promise<MonitoringUpdate>;
  getMonitoringStatus(userId: string): { isActive: boolean; signalsMonitored: number };
  subscribeToUpdates(callback: (signalId: string, update: MonitoringUpdate) => void): () => void;
}

export interface TradeDecision {
  shouldEnter: boolean;
  direction?: 'long' | 'short';
  urgency: 'low' | 'medium' | 'high';
  riskReward: number;
  confidence: number;
}

// Callbacks and event types
export type UpdateCallback = (data: MarketData) => void;
export type AlertCallback = (alert: Alert) => void;

// Configuration types
export interface ServiceConfig {
  tier: 'free' | 'pro' | 'premium';
  features: {
    maxStrategies: number;
    maxWatchlistItems: number;
    maxActiveTrades: number;
    realtimeAlerts: boolean;
    cloudExecution: boolean;
    apiTrading: boolean;
  };
}