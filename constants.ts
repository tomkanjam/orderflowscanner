import { KlineInterval, GeminiModelOption } from './types';

export const API_BASE_URL = 'https://api.binance.com/api/v3';
export const WS_BASE_URL = 'wss://stream.binance.com:9443/stream?streams=';
export const TOP_N_PAIRS_LIMIT = 100;
export const KLINE_HISTORY_LIMIT = 250;
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
  { value: GeminiModelOption.FLASH_FAST, label: 'Gemini 2.5 Flash (Fast)', internalModel: 'gemini-2.5-flash' },
  { value: GeminiModelOption.FLASH_ADVANCED, label: 'Gemini 2.5 Flash (Advanced)', internalModel: 'gemini-2.5-flash' },
  { value: GeminiModelOption.PRO, label: 'Gemini 2.5 Pro', internalModel: 'gemini-2.5-pro' },
];

export const DEFAULT_KLINE_INTERVAL = KlineInterval.ONE_MINUTE;
export const DEFAULT_GEMINI_MODEL = GeminiModelOption.FLASH_FAST;

export const DEBOUNCE_DELAY = 300; // ms for search input or other debounced actions