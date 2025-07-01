
export interface Ticker {
  s: string; // Symbol
  P: string; // Price change percent
  c: string; // Last price
  q: string; // Total traded quote asset volume
  // Add other properties from Binance ticker if needed
  [key: string]: any; // Allow other properties
}

// Format from Binance: [openTime, open, high, low, close, volume, closeTime, quoteAssetVolume, numberOfTrades, takerBuyBaseAssetVolume, takerBuyQuoteAssetVolume, ignore]
export type Kline = [
  number, // openTime
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  number, // closeTime
  string, // quoteAssetVolume
  number, // numberOfTrades
  string, // takerBuyBaseAssetVolume
  string, // takerBuyQuoteAssetVolume
  string  // ignore
];

// Custom indicator configuration for flexible charting
export interface CustomIndicatorConfig {
  id: string;                    // Unique identifier
  name: string;                  // Display name
  panel: boolean;                // true = separate panel, false = overlay on price
  calculateFunction: string;     // JavaScript function body that calculates the indicator
  chartType: 'line' | 'bar' | 'candlestick';
  style: {
    color?: string | string[];   // Single color or array for multi-line indicators
    fillColor?: string;          // For area fills
    lineWidth?: number;
    barColors?: { positive: string; negative: string; neutral: string };
  };
  yAxisConfig?: {
    min?: number;
    max?: number; 
    position?: 'left' | 'right';
    label?: string;
  };
}

// Data point structure for indicator values
export interface IndicatorDataPoint {
  x: number;        // timestamp
  y: number | null; // primary value
  y2?: number | null;      // For multi-line indicators (e.g., Bollinger upper band)
  y3?: number | null;      // For multi-line indicators (e.g., Bollinger lower band)
  y4?: number | null;      // For OHLC data
  color?: string;   // Per-point color override (e.g., for volume bars)
}

export interface AiFilterResponse {
  description: string[];
  screenerCode: string;
  indicators: CustomIndicatorConfig[]; // Renamed from chartConfig for clarity
}

export interface GeminiContent {
  parts: [{ text: string }];
  role: string;
}

// For Chart.js financial chart - keeping this for the main price candlestick chart
export interface CandlestickDataPoint {
  x: number; // timestamp
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
}

export enum KlineInterval {
  ONE_MINUTE = '1m',
  FIVE_MINUTES = '5m',
  FIFTEEN_MINUTES = '15m',
  ONE_HOUR = '1h',
  FOUR_HOURS = '4h',
  ONE_DAY = '1d',
}

export enum GeminiModelOption {
  FLASH_FAST = 'gemini-2.5-flash-fast',
  FLASH_ADVANCED = 'gemini-2.5-flash-advanced',
  PRO = 'gemini-2.5-pro',
}

export interface SignalLogEntry {
  timestamp: number;
  symbol: string;
  interval: KlineInterval;
  filterDesc: string; // A short description of the filter active at the time
  priceAtSignal: number;
  changePercentAtSignal: number;
  volumeAtSignal: number;
  count: number; // Number of times signal triggered within threshold
  // Analysis results (populated after analyze is clicked)
  tradeDecision?: 'BUY' | 'SELL' | 'HOLD' | 'WAIT';
  reasoning?: string;
  tradePlan?: string;
  fullAnalysis?: string;
}

// Used for tracking signal history in deduplication logic
export interface SignalHistoryEntry {
  timestamp: number;
  barCount: number;
}

// Volume Node structure for High Volume Nodes (HVN)
export interface VolumeNode {
  price: number;           // Price level of the node
  volume: number;          // Total volume at this price level
  buyVolume?: number;      // Optional: buy volume
  sellVolume?: number;     // Optional: sell volume
  strength: number;        // 0-100 score based on relative volume
  priceRange: [number, number]; // [min, max] price boundaries of this bin
}

// HVN calculation options
export interface HVNOptions {
  bins?: number;           // Number of price divisions (default: 30)
  threshold?: number;      // Percentile for "high" volume (default: 70)
  lookback?: number;       // Number of candles to analyze (default: 250)
  minStrength?: number;    // Minimum node strength (default: 50)
  peakTolerance?: number;  // Tolerance for peak detection (default: 0.05 = 5%)
  cacheKey?: string;       // Optional cache key for performance
}

// Historical Signal Detection Types
export interface HistoricalScanConfig {
  lookbackBars: number; // How many bars to look back
  scanInterval: number; // Check every N bars
  maxSignalsPerSymbol: number;
  includeIndicatorSnapshots: boolean;
}

export interface HistoricalSignal extends SignalLogEntry {
  id: string;
  barIndex: number;
  klineTimestamp: number;
  isHistorical: true; // Type discriminator
  barsAgo?: number; // How many bars ago this signal occurred
  // Snapshot of indicators at signal time
  indicators?: {
    rsi?: number;
    macd?: { macd: number; signal: number; histogram: number };
    ma20?: number;
    ma50?: number;
    bb?: { upper: number; middle: number; lower: number };
    volume?: number;
  };
  // For comparison with current state
  currentPrice?: number;
  priceChangeSinceSignal?: number;
  percentChangeSinceSignal?: number;
}

// Combined type for signals that can be either live or historical
export type CombinedSignal = SignalLogEntry | HistoricalSignal;

export interface HistoricalScanProgress {
  currentSymbol: string;
  symbolIndex: number;
  totalSymbols: number;
  percentComplete: number;
  signalsFound: number;
}

// Kline history limit configuration
export interface KlineHistoryConfig {
  screenerLimit: number;      // Number of klines for screener operations (default: 250)
  analysisLimit: number;      // Number of klines for symbol analysis (default: 100)
  aiAnalysisLimit: number;    // Number of klines/indicators for AI signal analysis (default: 100, range: 1-1000)
}