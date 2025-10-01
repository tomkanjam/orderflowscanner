/**
 * Main Entry Point for Fly Machine
 * Bootstraps and runs the Orchestrator
 */

import { Orchestrator } from './Orchestrator';
import { FlyMachineConfig, ScalingPolicy } from './types';

// Environment variables
const USER_ID = process.env.USER_ID || '';
const MACHINE_ID = process.env.MACHINE_ID || `machine_${Date.now()}`;
const MACHINE_REGION = (process.env.MACHINE_REGION || 'sin') as 'sin' | 'iad' | 'fra';
const MACHINE_CPUS = parseInt(process.env.MACHINE_CPUS || '1', 10);
const MACHINE_MEMORY = parseInt(process.env.MACHINE_MEMORY || '256', 10);

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const KLINE_INTERVAL = (process.env.KLINE_INTERVAL || '5m') as '1m' | '5m' | '15m' | '1h';
const SCREENING_INTERVAL_MS = parseInt(process.env.SCREENING_INTERVAL_MS || '60000', 10); // 1 minute default

// Validate required environment variables
function validateEnvironment(): void {
  const required = ['USER_ID', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('[Main] Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
}

// Get symbols to monitor (top 100 USDT pairs by default)
async function getSymbols(): Promise<string[]> {
  // TODO: Fetch from Binance API or configuration
  // For now, return hardcoded list
  return [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'DOGEUSDT',
    'XRPUSDT', 'DOTUSDT', 'UNIUSDT', 'LINKUSDT', 'LTCUSDT',
    'SOLUSDT', 'MATICUSDT', 'AVAXUSDT', 'ATOMUSDT', 'ETCUSDT',
    'ALGOUSDT', 'XLMUSDT', 'VETUSDT', 'FILUSDT', 'TRXUSDT',
    // Add more as needed
  ];
}

// Main function
async function main() {
  console.log('='.repeat(80));
  console.log('Fly Machine - AI-Powered Crypto Screener');
  console.log('='.repeat(80));
  console.log();

  // Validate environment
  validateEnvironment();

  console.log('[Main] Configuration:');
  console.log('  User ID:', USER_ID);
  console.log('  Machine ID:', MACHINE_ID);
  console.log('  Region:', MACHINE_REGION);
  console.log('  CPUs:', MACHINE_CPUS);
  console.log('  Memory:', MACHINE_MEMORY, 'MB');
  console.log('  Kline Interval:', KLINE_INTERVAL);
  console.log('  Screening Interval:', SCREENING_INTERVAL_MS, 'ms');
  console.log();

  // Machine configuration
  const machineConfig: FlyMachineConfig = {
    machineId: MACHINE_ID,
    userId: USER_ID,
    region: MACHINE_REGION,
    cpus: MACHINE_CPUS,
    memory: MACHINE_MEMORY,
    status: 'starting',
    version: '1.0.0'
  };

  // Scaling policy
  const scalingPolicy: ScalingPolicy = {
    minCpus: 1,
    maxCpus: 8,
    scaleUpThreshold: 10, // Queue depth to trigger scale-up
    scaleDownThreshold: 2, // Queue depth to trigger scale-down
    cooldownPeriod: 300 // 5 minutes in seconds
  };

  // Get symbols
  console.log('[Main] Loading symbols...');
  const symbols = await getSymbols();
  console.log('[Main] Monitoring', symbols.length, 'symbols');
  console.log();

  // Create orchestrator
  const orchestrator = new Orchestrator({
    userId: USER_ID,
    machineConfig,
    scalingPolicy,
    supabaseUrl: SUPABASE_URL,
    supabaseServiceKey: SUPABASE_SERVICE_KEY,
    symbols,
    klineInterval: KLINE_INTERVAL,
    screeningIntervalMs: SCREENING_INTERVAL_MS
  });

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    console.log();
    console.log(`[Main] Received ${signal}, shutting down gracefully...`);

    try {
      await orchestrator.stop();
      console.log('[Main] Shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('[Main] Shutdown error:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('[Main] Uncaught exception:', error);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Main] Unhandled rejection at:', promise, 'reason:', reason);
    shutdown('unhandledRejection');
  });

  // Start orchestrator
  try {
    await orchestrator.start();

    console.log();
    console.log('='.repeat(80));
    console.log('Machine is running! Press Ctrl+C to stop.');
    console.log('='.repeat(80));
    console.log();

    // Log status every 5 minutes
    setInterval(() => {
      const status = orchestrator.getStatus();
      console.log('[Main] Status:', {
        isRunning: status.isRunning,
        isPaused: status.isPaused,
        traders: status.traderCount,
        symbols: status.symbolCount,
        metrics: status.metrics,
        health: status.health.status
      });
    }, 300000); // 5 minutes

  } catch (error) {
    console.error('[Main] Failed to start:', error);
    process.exit(1);
  }
}

// Run main function
main().catch(error => {
  console.error('[Main] Fatal error:', error);
  process.exit(1);
});
