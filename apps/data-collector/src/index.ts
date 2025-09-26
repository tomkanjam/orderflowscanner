import express from 'express';
import { BinanceCollector } from './BinanceCollector';
import { RedisWriter } from './RedisWriter';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Redis writer
let redisWriter: RedisWriter;
let collector: BinanceCollector;

// Top traded USDT pairs for initial testing
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

// Intervals to track
const INTERVALS = ['1m', '5m', '15m', '1h'];

async function initialize() {
  try {
    console.log('Initializing data collector service...');
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

    // Initialize Redis connection
    redisWriter = new RedisWriter();

    // Test Redis connection
    const pingSuccess = await redisWriter.ping();
    if (!pingSuccess) {
      throw new Error('Failed to connect to Redis');
    }
    console.log('✓ Connected to Redis');

    // Get symbols from environment or use defaults
    const symbolsStr = process.env.SYMBOLS || DEFAULT_SYMBOLS.join(',');
    const symbols = symbolsStr.split(',').map(s => s.trim());

    console.log(`Tracking ${symbols.length} symbols:`, symbols.join(', '));
    console.log(`Intervals: ${INTERVALS.join(', ')}`);

    // Initialize Binance collector
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