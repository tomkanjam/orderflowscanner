/**
 * Type definitions for AI Analysis Edge Function
 * These types mirror the Fly machine types but are defined here for Deno compatibility
 */

// Kline data structure from Binance
export type Kline = [
  number,  // openTime
  string,  // open
  string,  // high
  string,  // low
  string,  // close
  string,  // volume
  number,  // closeTime
  string,  // quoteAssetVolume
  number,  // numberOfTrades
  string,  // takerBuyBaseAssetVolume
  string,  // takerBuyQuoteAssetVolume
  string   // ignore
];

/**
 * Pre-calculated technical indicators (from screenerHelpers on Fly machine)
 */
export interface CalculatedIndicators {
  // Moving averages
  sma_20?: number;
  sma_50?: number;
  sma_200?: number;
  ema_12?: number;
  ema_26?: number;

  // Oscillators
  rsi_14?: number;
  macd?: {
    macd: number;
    signal: number;
    histogram: number;
  };

  // Volatility
  bb?: {
    upper: number;
    middle: number;
    lower: number;
  };
  atr_14?: number;

  // Volume
  obv?: number;
  vwap?: number;

  // Momentum
  stoch?: {
    k: number;
    d: number;
  };

  // Custom indicators (trader-specific)
  [key: string]: any;
}

/**
 * Key price levels for trade management
 */
export interface KeyLevels {
  entry: number;              // Recommended entry price
  stopLoss: number;           // ATR-based stop loss
  takeProfit: number[];       // Multiple TP targets
  support: number[];          // Support levels from recent lows
  resistance: number[];       // Resistance levels from recent highs
}

/**
 * Structured trade execution plan
 */
export interface TradePlan {
  setup: string;              // When/why to enter
  execution: string;          // How to manage position
  invalidation: string;       // When to exit/abandon
  riskReward: number;         // Expected R:R ratio
}

/**
 * Request payload from Fly machine to Edge Function
 */
export interface AnalysisRequest {
  // Signal identification
  signalId: string;           // UUID from signals table
  traderId: string;           // UUID from traders table
  userId: string;             // UUID from users table (for RLS)

  // Market data
  symbol: string;             // e.g., "BTCUSDT"
  price: number;              // Current price at signal trigger
  klines: Kline[];            // Last 100 historical klines

  // Trading context
  strategy: string;           // User's strategy description
  calculatedIndicators: CalculatedIndicators; // Pre-calculated technical indicators

  // Metadata
  priority: 'low' | 'normal' | 'high';
  correlationId: string;      // For distributed tracing
}

/**
 * Response from Edge Function to Fly machine
 */
export interface AnalysisResponse {
  // Core analysis
  signalId: string;
  decision: 'enter_trade' | 'bad_setup' | 'wait';
  confidence: number;         // 0-100 scale
  reasoning: string;          // Multi-line explanation

  // Trade execution details
  keyLevels: KeyLevels;
  tradePlan: TradePlan;
  technicalIndicators: Record<string, any>;

  // Performance metadata
  metadata: {
    analysisLatencyMs: number;
    geminiTokensUsed: number;
    modelName: string;
    rawAiResponse: string;    // Full Gemini JSON response
  };

  // Error handling
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

/**
 * Gemini API request structure
 */
export interface GeminiRequest {
  contents: Array<{
    role: 'user' | 'model';
    parts: Array<{
      text: string;
    }>;
  }>;
  generationConfig: {
    responseMimeType: 'application/json';
    temperature?: number;
    maxOutputTokens?: number;
  };
}

/**
 * Gemini API response structure
 */
export interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;  // JSON string to parse
      }>;
    };
    finishReason: string;
  }>;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

/**
 * Parsed structured analysis from Gemini
 */
export interface GeminiAnalysis {
  decision: 'enter_trade' | 'bad_setup' | 'wait';
  confidence: number;
  reasoning: string;
  tradePlan: {
    setup: string;
    execution: string;
    invalidation: string;
    riskReward: number;
  };
  technicalContext: Record<string, any>;
}
