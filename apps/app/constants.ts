import { KlineInterval, GeminiModelOption } from './types';

export const API_BASE_URL = 'https://api.binance.com/api/v3';
export const TOP_N_PAIRS_LIMIT = 100;
export const KLINE_HISTORY_LIMIT = 1440;
export const KLINE_HISTORY_LIMIT_FOR_ANALYSIS = 100; // Added for symbol analysis

export const KLINE_INTERVALS: { value: KlineInterval; label: string }[] = [
  { value: KlineInterval.ONE_MINUTE, label: '1 Minute' },
  { value: KlineInterval.FIVE_MINUTES, label: '5 Minutes' },
  { value: KlineInterval.FIFTEEN_MINUTES, label: '15 Minutes' },
  { value: KlineInterval.ONE_HOUR, label: '1 Hour' },
  { value: KlineInterval.FOUR_HOURS, label: '4 Hours' },
  { value: KlineInterval.ONE_DAY, label: '1 Day' },
];

export const GEMINI_MODELS: { value: GeminiModelOption; label: string, internalModel: string }[] = [
  { value: GeminiModelOption.FLASH_FAST, label: 'Gemini 2.5 Flash', internalModel: 'gemini-2.5-flash' },
  { value: GeminiModelOption.PRO, label: 'Gemini 2.5 Pro', internalModel: 'gemini-2.5-pro' },
];

export const DEFAULT_KLINE_INTERVAL = KlineInterval.ONE_MINUTE;
export const DEFAULT_GEMINI_MODEL = GeminiModelOption.PRO;

export const DEBOUNCE_DELAY = 300; // ms for search input or other debounced actions

// Debug mode flag - set to false for production
export const DEBUG_MODE = false;

// Maximum number of signal log entries to keep in memory
export const MAX_SIGNAL_LOG_ENTRIES = 100;

// Stablecoin blacklist - these base assets will be filtered out
export const STABLECOIN_BLACKLIST = [
  'USDC',  // USD Coin
  'BUSD',  // Binance USD
  'TUSD',  // TrueUSD
  'USDP',  // Pax Dollar
  'FDUSD', // First Digital USD
  'DAI',   // DAI
  'FRAX',  // Frax
  'USTC',  // TerraClassicUSD
  'UST',   // TerraUSD
  'AEUR',  // Anchored EUR
  'EURT',  // Euro Tether
  'EUROC', // Euro Coin
  'USDD',  // Decentralized USD
  'GUSD',  // Gemini Dollar
  'SUSD',  // sUSD
  'LUSD',  // Liquity USD
  'CUSD',  // Celo Dollar
  'MUSD',  // mStable USD
  'OUSD',  // Origin Dollar
  'EURS',  // STASIS EURO
  'XSGD',  // Singapore Dollar
  'BIDR',  // Binance IDR
  'IDRT',  // Rupiah Token
  'BKRW',  // Binance KRW
  'USDX',  // USD Digital
  'TRYB',  // BiLira
  'VAI',   // VAI
  'USDJ',  // JUST Stablecoin
  'USDN',  // Neutrino USD
  'CUSDT', // Compound USDT
  'CUSDC', // Compound USDC
  'CDAI',  // Compound DAI
  'HUSD',  // HUSD
  'RSV',   // Reserve
  'USDK',  // OKLink USD
  'USDQ',  // USDQ
  'USDEX', // USDEX
  'USDS',  // StableUSD
  'RUSD',  // Realio USD
  'ZUSD',  // Z.com USD
  'DUSD',  // DefiChain USD
  'AGEUR', // Angle EUR
];