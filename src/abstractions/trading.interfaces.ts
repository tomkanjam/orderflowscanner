// Trading Engine Interfaces and Types

export interface TradingMode {
  type: 'demo' | 'live';
  exchangeId?: string; // For live mode
}

export interface OrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  quantity: number;
  price?: number; // For limit orders
  stopPrice?: number; // For stop orders
  clientOrderId?: string; // Custom order ID
  reduceOnly?: boolean; // For futures
  timeInForce?: 'GTC' | 'IOC' | 'FOK'; // Good Till Cancelled, Immediate or Cancel, Fill or Kill
  metadata?: Record<string, any>; // Custom metadata
}

export interface Order {
  id: string;
  clientOrderId?: string;
  symbol: string;
  exchange: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  status: 'pending' | 'open' | 'closed' | 'canceled' | 'expired' | 'rejected';
  price?: number;
  averagePrice?: number;
  quantity: number;
  filled: number;
  remaining: number;
  cost: number; // Total cost (price * filled)
  fee?: {
    currency: string;
    cost: number;
  };
  trades?: Trade[]; // Fills
  timestamp: Date;
  lastUpdated: Date;
  metadata?: Record<string, any>;
}

export interface Trade {
  id: string;
  orderId: string;
  symbol: string;
  exchange: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  cost: number;
  fee?: {
    currency: string;
    cost: number;
  };
  timestamp: Date;
}

export interface Position {
  id: string;
  symbol: string;
  exchange: string;
  side: 'long' | 'short';
  contracts: number; // Position size
  entryPrice: number;
  markPrice: number; // Current market price
  liquidationPrice?: number;
  unrealizedPnl: number;
  realizedPnl: number;
  percentage: number; // PnL percentage
  margin?: number; // Used margin
  maintenanceMargin?: number;
  marginRatio?: number;
  timestamp: Date;
  lastUpdated: Date;
}

export interface Balance {
  currency: string;
  free: number; // Available balance
  used: number; // In orders
  total: number; // free + used
}

export interface ExchangeAccount {
  id: string;
  name: string;
  exchange: string;
  isTestnet: boolean;
  apiKey: string; // Encrypted
  apiSecret: string; // Encrypted
  password?: string; // Some exchanges require password (encrypted)
  subaccount?: string; // Subaccount name if applicable
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderUpdate {
  order: Order;
  event: 'created' | 'updated' | 'filled' | 'canceled' | 'rejected';
  timestamp: Date;
}

export interface PositionUpdate {
  position: Position;
  event: 'opened' | 'updated' | 'closed';
  timestamp: Date;
}

// Trading Engine Interface
export interface ITradingEngine {
  // Mode
  getMode(): TradingMode;
  
  // Orders
  createOrder(request: OrderRequest): Promise<Order>;
  cancelOrder(orderId: string, symbol?: string): Promise<Order>;
  getOrder(orderId: string, symbol?: string): Promise<Order>;
  getOrders(symbol?: string, since?: Date, limit?: number): Promise<Order[]>;
  getOpenOrders(symbol?: string): Promise<Order[]>;
  
  // Positions (for futures/derivatives)
  getPositions(symbols?: string[]): Promise<Position[]>;
  getPosition(symbol: string): Promise<Position | null>;
  closePosition(symbol: string, reduceOnly?: boolean): Promise<Order>;
  
  // Balances
  getBalances(): Promise<Balance[]>;
  getBalance(currency: string): Promise<Balance | null>;
  
  // Market Data (some engines might want to override)
  getTicker(symbol: string): Promise<any>;
  getOrderBook(symbol: string, limit?: number): Promise<any>;
  
  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  
  // Events
  on(event: 'order', listener: (update: OrderUpdate) => void): void;
  on(event: 'position', listener: (update: PositionUpdate) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  off(event: string, listener: Function): void;
}

// Factory function type
export type TradingEngineFactory = (mode: TradingMode, account?: ExchangeAccount) => ITradingEngine;

// Encryption interface for API keys
export interface IEncryption {
  encrypt(text: string): string;
  decrypt(encryptedText: string): string;
}

// Risk management
export interface RiskLimits {
  maxPositionSize: number; // Max position size per symbol
  maxTotalExposure: number; // Max total portfolio exposure
  maxLossPerTrade: number; // Max loss per trade (%)
  maxDailyLoss: number; // Max daily loss (%)
  maxOpenPositions: number; // Max concurrent positions
}

// Order validation
export interface OrderValidation {
  isValid: boolean;
  errors?: string[];
  warnings?: string[];
}