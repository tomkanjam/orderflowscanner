import { CustomIndicatorConfig, KlineInterval } from '../../types';
import { AccessTier } from '../types/subscription.types';

// Core Trader interfaces
export interface Trader {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  
  // Trading configuration
  mode: 'demo' | 'live';
  exchangeConfig?: ExchangeConfig;
  
  // Core configuration
  filter: TraderFilter;
  strategy: TraderStrategy;
  
  // Performance metrics
  metrics: TraderMetrics;
  
  // Ownership and access
  userId?: string;
  ownershipType: 'system' | 'user';
  accessTier: AccessTier;
  isBuiltIn: boolean;
  category?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  adminNotes?: string;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;

  // Cloud execution configuration (Elite tier only)
  version?: number; // For optimistic locking
  cloud_config?: CloudConfig;

  // Display configuration (optional) - for UI customization
  displayConfig?: {
    variant?: 'compact' | 'standard' | 'detailed';
    priority?: 'high' | 'normal' | 'low';
    lastActivity?: number; // Timestamp of last activity for UI indicators
  };
}

// Cloud execution configuration
export interface CloudConfig {
  enabledInCloud: boolean;
  preferredRegion?: 'sin' | 'iad' | 'fra';
  cpuPriority?: 'low' | 'normal' | 'high';
  notifyOnSignal?: boolean;
  notifyOnAnalysis?: boolean;
}

export interface TraderFilter {
  code: string;
  description: string[];
  indicators?: CustomIndicatorConfig[];
  refreshInterval?: KlineInterval; // How often to check for new signals (renamed from interval)
  requiredTimeframes?: KlineInterval[]; // Timeframes needed by the filter code (LLM-determined)
}

export interface TraderStrategy {
  instructions: string;
  riskManagement: RiskManagement;
  aiAnalysisLimit?: number; // Number of bars to send to AI (default: 100, range: 1-1000)
  modelTier?: 'lite' | 'standard' | 'pro'; // AI model tier for analysis (default: 'standard')
  maxConcurrentAnalysis?: number; // Maximum number of signals to analyze concurrently (default: 3)
}

export interface RiskManagement {
  stopLoss?: number;
  takeProfit?: number;
  maxPositions?: number;
  positionSizePercent?: number;
  maxDrawdown?: number;
}

export interface ExchangeConfig {
  exchange: SupportedExchange;
  apiKey?: string; // Encrypted
  apiSecret?: string; // Encrypted
  testnet?: boolean;
}

export type SupportedExchange = 'binance' | 'binance-us' | 'coinbase' | 'kraken' | 'kucoin';

export interface TraderMetrics {
  totalSignals: number;
  activePositions: number;
  closedPositions: number;
  totalPnL: number;
  totalPnLPercent: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  lastSignalAt?: Date;
  // Separate demo vs live metrics
  demoMetrics?: PerformanceMetrics;
  liveMetrics?: PerformanceMetrics;
}

export interface PerformanceMetrics {
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
  pnlPercent: number;
  avgWin: number;
  avgLoss: number;
  maxDrawdown: number;
  sharpeRatio?: number;
}

// Service interfaces
export interface ITraderManager {
  // CRUD operations
  createTrader(trader: Omit<Trader, 'id' | 'metrics' | 'createdAt' | 'updatedAt'>): Promise<Trader>;
  getTrader(id: string): Promise<Trader | null>;
  getTraders(filter?: { enabled?: boolean; mode?: 'demo' | 'live' }): Promise<Trader[]>;
  updateTrader(id: string, updates: Partial<Trader>): Promise<Trader>;
  deleteTrader(id: string): Promise<void>;
  
  // Control operations
  enableTrader(id: string): Promise<void>;
  disableTrader(id: string): Promise<void>;
  
  // Metrics operations
  updateMetrics(id: string, metrics: Partial<TraderMetrics>): Promise<void>;
  resetMetrics(id: string, mode?: 'demo' | 'live' | 'all'): Promise<void>;
  
  // Subscription
  subscribe(callback: (traders: Trader[]) => void): () => void;
}

// Trade execution interfaces
export interface ITradeExecutor {
  executeTrade(trade: TradeRequest): Promise<TradeResult>;
  cancelOrder(orderId: string): Promise<void>;
  modifyOrder(orderId: string, updates: OrderUpdate): Promise<TradeResult>;
  getPosition(symbol: string): Promise<Position | null>;
  getOpenOrders(symbol?: string): Promise<Order[]>;
  getBalance(): Promise<Balance>;
}

export interface TradeRequest {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  traderId: string;
  signalId: string;
}

export interface TradeResult {
  orderId: string;
  status: 'filled' | 'partial' | 'pending' | 'cancelled' | 'rejected';
  executedQty: number;
  executedPrice: number;
  commission?: number;
  commissionAsset?: string;
  transactTime: Date;
  mode: 'demo' | 'live';
}

export interface OrderUpdate {
  quantity?: number;
  price?: number;
  stopPrice?: number;
}

export interface Position {
  symbol: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  openTime: Date;
}

export interface Order {
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: string;
  quantity: number;
  price?: number;
  status: string;
  createdAt: Date;
}

export interface Balance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

// AI Generation interfaces
export interface TraderGeneration {
  suggestedName: string;
  description: string;
  filterCode: string;
  filterDescription: string[];
  strategyInstructions: string;
  indicators: CustomIndicatorConfig[];
  riskParameters: RiskManagement;
  requiredTimeframes?: KlineInterval[];
}

// Events
export interface TraderEvent {
  type: 'created' | 'updated' | 'deleted' | 'enabled' | 'disabled' | 'signal' | 'trade';
  traderId: string;
  timestamp: Date;
  data?: any;
}