import express from 'express';
import { BinanceCollector } from './BinanceCollector';
import { RedisWriter } from './RedisWriter';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Redis writer
let redisWriter: RedisWriter;
let collector: BinanceCollector;

// Default symbols as fallback
const DEFAULT_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'BNBUSDT',
  'SOLUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'SHIBUSDT',
  'DOTUSDT'
];

// Fetch top USDT pairs by volume
async function fetchTopUSDTPairs(limit: number = 100): Promise<string[]> {
  try {
    console.log(`Fetching top ${limit} USDT pairs by volume...`);

    // Fetch 24hr ticker statistics
    const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const tickers = await response.json() as Array<{
      symbol: string;
      quoteVolume: string;
      count: number;
    }>;

    // Filter USDT pairs and sort by volume
    const usdtPairs = tickers
      .filter(t => t.symbol.endsWith('USDT'))
      .filter(t => !t.symbol.includes('DOWN') && !t.symbol.includes('UP')) // Exclude leveraged tokens
      .filter(t => parseFloat(t.quoteVolume) > 100000) // Min volume threshold
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, limit)
      .map(t => t.symbol);

    console.log(`Found ${usdtPairs.length} USDT pairs with sufficient volume`);
    return usdtPairs.length > 0 ? usdtPairs : DEFAULT_SYMBOLS;

  } catch (error) {
    console.error('Failed to fetch top pairs, using defaults:', error);
    return DEFAULT_SYMBOLS;
  }
}

// Intervals to track
const INTERVALS = ['1m', '5m', '15m', '1h'];

async function initialize() {
  try {
    console.log('Initializing data collector service...');
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

    // Initialize Redis connection
    redisWriter = new RedisWriter();

    // Test Redis connection
    console.log('Testing Redis connection...');
    try {
      const pingSuccess = await redisWriter.ping();
      if (!pingSuccess) {
        throw new Error('Failed to connect to Redis - ping returned false');
      }
      console.log('✓ Connected to Redis');
    } catch (error) {
      console.error('Redis connection error:', error);
      throw new Error(`Failed to connect to Redis: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Get symbols from environment, fetch dynamically, or use defaults
    let symbols: string[];

    if (process.env.SYMBOLS) {
      // Use explicitly configured symbols
      symbols = process.env.SYMBOLS.split(',').map(s => s.trim());
      console.log(`Using ${symbols.length} configured symbols`);
    } else {
      // Fetch top pairs dynamically
      const limit = parseInt(process.env.SYMBOL_LIMIT || '100', 10);
      symbols = await fetchTopUSDTPairs(limit);
      console.log(`Using top ${symbols.length} USDT pairs by volume`);
    }

    console.log(`Tracking ${symbols.length} symbols:`, symbols.slice(0, 10).join(', '), '...');
    console.log(`Intervals: ${INTERVALS.join(', ')}`);

    // Initialize Binance collector with batching for large symbol lists
    collector = new BinanceCollector(redisWriter, symbols, INTERVALS);
    await collector.start();

    console.log('✓ Data collector service started successfully');
  } catch (error) {
    console.error('Failed to initialize:', error);
    process.exit(1);
  }
}

// Health check endpoint
app.get('/health', (_req, res) => {
  const collectorStatus = collector?.getStatus() || {
    connected: false,
    connectionCount: 0,
    symbolCount: 0,
    streamCount: 0
  };

  const redisStatus = redisWriter?.getStatus() || {
    connected: false,
    pipelineSize: 0
  };

  const healthy = collectorStatus.connected && redisStatus.connected;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    collector: collectorStatus,
    redis: redisStatus
  });
});

// Get current symbols being tracked
app.get('/symbols', (_req, res) => {
  const status = collector?.getStatus();
  res.json({
    symbols: process.env.SYMBOLS?.split(',') || DEFAULT_SYMBOLS,
    intervals: INTERVALS,
    status
  });
});

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\n${signal} received, starting graceful shutdown...`);

  try {
    // Stop accepting new connections
    if (collector) {
      await collector.stop();
      console.log('✓ Collector stopped');
    }

    // Cleanup Redis
    if (redisWriter) {
      await redisWriter.cleanup();
      console.log('✓ Redis cleanup complete');
    }

    console.log('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  shutdown('unhandledRejection');
});

// Start server
app.listen(PORT, () => {
  console.log(`Health check server listening on port ${PORT}`);
  console.log(`Health endpoint: http://localhost:${PORT}/health`);

  // Initialize after server starts
  initialize();
});