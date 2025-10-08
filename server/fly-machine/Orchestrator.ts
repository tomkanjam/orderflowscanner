/**
 * Orchestrator - Main Coordinator for Fly Machine
 * Coordinates all services and manages the screening/analysis lifecycle
 */

import { EventEmitter } from 'events';
import { BinanceWebSocketClient } from './services/BinanceWebSocketClient';
import { ParallelScreener } from './services/ParallelScreener';
import { ConcurrentAnalyzer } from './services/ConcurrentAnalyzer';
import { StateSynchronizer } from './services/StateSynchronizer';
import { DynamicScaler } from './services/DynamicScaler';
import { HealthMonitor } from './services/HealthMonitor';
import { WebSocketServer } from './services/WebSocketServer';
import { EdgeFunctionHealthPing } from './services/EdgeFunctionHealthPing';
import {
  FlyMachineConfig,
  CloudTrader,
  ScalingPolicy,
  MarketData,
  TraderResult
} from './types';

interface OrchestratorConfig {
  userId: string;
  machineConfig: FlyMachineConfig;
  scalingPolicy: ScalingPolicy;
  supabaseUrl: string;
  supabaseServiceKey: string;
  symbols: string[];
  klineInterval: '1m' | '5m' | '15m' | '1h';
  screeningIntervalMs: number; // How often to run screening
}

export class Orchestrator extends EventEmitter {
  // Core services
  private binance: BinanceWebSocketClient;
  private screener: ParallelScreener;
  private analyzer: ConcurrentAnalyzer;
  private synchronizer: StateSynchronizer;
  private scaler: DynamicScaler;
  private healthMonitor: HealthMonitor;
  private wsServer: WebSocketServer;
  private edgeFunctionPing: EdgeFunctionHealthPing;

  // Configuration
  private config: OrchestratorConfig;
  private traders: CloudTrader[] = [];
  private isRunning = false;
  private isPaused = false;

  // Screening loop
  private screeningInterval: NodeJS.Timeout | null = null;
  private lastScreeningTime: Date | null = null;

  // Metrics
  private metrics = {
    totalScreenings: 0,
    totalSignals: 0,
    totalAnalyses: 0,
    errors: 0
  };

  constructor(config: OrchestratorConfig) {
    super();
    this.config = config;

    // Initialize services
    this.binance = new BinanceWebSocketClient();
    this.screener = new ParallelScreener();
    this.analyzer = new ConcurrentAnalyzer();
    this.synchronizer = new StateSynchronizer();
    this.scaler = new DynamicScaler();
    this.healthMonitor = new HealthMonitor();
    this.wsServer = new WebSocketServer();

    // Initialize Edge Function health ping
    const edgeFunctionUrl = process.env.SUPABASE_EDGE_FUNCTION_URL ||
      `${process.env.SUPABASE_URL}/functions/v1/ai-analysis`;
    this.edgeFunctionPing = new EdgeFunctionHealthPing(edgeFunctionUrl);

    // Wire up event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Binance WebSocket events
    this.binance.on('connected', () => {
      console.log('[Orchestrator] Binance WebSocket connected');
      this.healthMonitor.updateComponentStatus('binance', true);
    });

    this.binance.on('disconnected', () => {
      console.log('[Orchestrator] Binance WebSocket disconnected');
      this.healthMonitor.updateComponentStatus('binance', false);
    });

    this.binance.on('error', (error: Error) => {
      console.error('[Orchestrator] Binance error:', error);
      this.healthMonitor.recordError('binance', error.message);
      this.metrics.errors++;
    });

    // Screener events
    this.screener.on('results', (results: Map<string, TraderResult>) => {
      this.handleScreeningResults(results);
    });

    this.screener.on('error', (error: Error) => {
      console.error('[Orchestrator] Screener error:', error);
      this.healthMonitor.recordError('screener', error.message);
      this.metrics.errors++;
    });

    // Analyzer events
    this.analyzer.on('analysis_complete', (result: any) => {
      this.handleAnalysisComplete(result);
    });

    this.analyzer.on('error', (error: Error) => {
      console.error('[Orchestrator] Analyzer error:', error);
      this.healthMonitor.recordError('analyzer', error.message);
      this.metrics.errors++;
    });

    // Synchronizer events
    this.synchronizer.on('sync_complete', () => {
      console.log('[Orchestrator] Sync complete');
    });

    this.synchronizer.on('error', (error: Error) => {
      console.error('[Orchestrator] Synchronizer error:', error);
      this.healthMonitor.recordError('synchronizer', error.message);
      this.metrics.errors++;
    });

    // Scaler events
    this.scaler.on('scaling_complete', (event: any) => {
      console.log('[Orchestrator] Scaling complete:', event);

      // Update worker pool size
      this.screener.scaleWorkerPool(event.workers);

      // Update machine status in database
      this.synchronizer.updateMachineStatus('running');

      // Broadcast to browser
      this.wsServer.broadcastStatusUpdate(
        'running',
        event.cpus,
        Date.now() - (this.healthMonitor.getHealth().uptime || 0)
      );
    });

    this.scaler.on('scaling_failed', (event: any) => {
      console.error('[Orchestrator] Scaling failed:', event.error);
      this.healthMonitor.recordError('scaler', event.error);
    });

    // Health monitor events
    this.healthMonitor.on('health_update', (health: any) => {
      // Update metrics in browser
      const queueDepth = this.analyzer.getQueueDepth();
      this.wsServer.broadcastMetricsUpdate({
        activeSignals: this.metrics.totalSignals,
        queueDepth,
        cpuUsage: health.metrics.cpuUsage,
        memoryUsage: health.metrics.memoryUsage
      });
    });

    // WebSocket server events
    this.wsServer.on('config_update', async (event: any) => {
      console.log('[Orchestrator] Config update from browser');
      await this.reloadTraders();
    });

    this.wsServer.on('pause_execution', () => {
      console.log('[Orchestrator] Pause requested');
      this.pause();
    });

    this.wsServer.on('resume_execution', () => {
      console.log('[Orchestrator] Resume requested');
      this.resume();
    });

    this.wsServer.on('force_sync', async () => {
      console.log('[Orchestrator] Force sync requested');
      await this.synchronizer.flush();
    });

    // Edge Function health ping events
    this.edgeFunctionPing.on('health_degraded', (event: any) => {
      console.error('[Orchestrator] Edge Function health degraded:', event.error);
      this.healthMonitor.recordError('edge_function', event.error);
      this.synchronizer.queueEvent(
        'machine_error',
        'error',
        `Edge Function health check failed: ${event.error}`
      );
    });

    this.edgeFunctionPing.on('health_restored', () => {
      console.log('[Orchestrator] Edge Function health restored');
      this.synchronizer.queueEvent(
        'config_synced',
        'info',
        'Edge Function health check restored'
      );
    });

    this.edgeFunctionPing.on('ping_failed', (event: any) => {
      console.warn('[Orchestrator] Edge Function ping failed:', event.error);
      this.metrics.errors++;
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    console.log('[Orchestrator] Starting...');
    console.log('[Orchestrator] User:', this.config.userId);
    console.log('[Orchestrator] Machine:', this.config.machineConfig.machineId);

    try {
      // 1. Initialize health monitor
      await this.healthMonitor.start();

      // 2. Initialize state synchronizer
      await this.synchronizer.initialize(
        this.config.userId,
        this.config.machineConfig.machineId
      );
      this.healthMonitor.updateComponentStatus('database', true);

      // 3. Load traders from database
      await this.reloadTraders();

      // 4. Initialize parallel screener
      const initialWorkers = Math.max(1, Math.floor(this.config.machineConfig.cpus / 2));
      await this.screener.initialize(initialWorkers);
      this.healthMonitor.updateComponentStatus('workers', true);

      // 5. Initialize concurrent analyzer
      await this.analyzer.initialize();

      // 6. Initialize dynamic scaler
      await this.scaler.initialize(this.config.machineConfig, this.config.scalingPolicy);

      // 7. Start WebSocket server
      await this.wsServer.start();

      // 8. Start Edge Function health ping service
      await this.edgeFunctionPing.start();
      console.log('[Orchestrator] Edge Function health ping service started');

      // 9. Determine required intervals from traders (like browser does)
      const requiredIntervals = this.determineRequiredIntervals();
      console.log(`[Orchestrator] Required kline intervals: ${requiredIntervals.join(', ')}`);

      // 9. Connect to Binance WebSocket with all required intervals
      await this.binance.connect(this.config.symbols, requiredIntervals as any);

      // 10. Fetch historical klines for all symbols and intervals
      // All intervals get 1440 klines (24 hours of data)
      console.log(`[Orchestrator] Fetching historical klines for intervals: ${requiredIntervals.join(', ')}...`);

      const fetchStartTime = Date.now();
      await this.binance.fetchHistoricalKlines(
        this.config.symbols,
        requiredIntervals as any
      );

      const fetchDuration = ((Date.now() - fetchStartTime) / 1000).toFixed(1);
      console.log(`[Orchestrator] Historical klines fetched in ${fetchDuration}s`);

      // 11. Update machine status
      await this.synchronizer.updateMachineStatus('running');

      // 12. Start screening loop
      this.startScreeningLoop();

      this.isRunning = true;

      console.log('[Orchestrator] Started successfully');
      console.log('[Orchestrator] Monitoring', this.traders.length, 'traders');
      console.log('[Orchestrator] Watching', this.config.symbols.length, 'symbols');

    } catch (error) {
      console.error('[Orchestrator] Failed to start:', error);
      this.healthMonitor.recordError('orchestrator', `Startup failed: ${error}`);
      throw error;
    }
  }

  private async reloadTraders(): Promise<void> {
    console.log('[Orchestrator] Loading traders from database...');

    try {
      // Load ALL traders for user
      const allTraders = await this.synchronizer.loadTraders();
      console.log(`[Orchestrator] Loaded ${allTraders.length} total traders`);

      // [TIER ACCESS] Get user tier (cached after first call)
      const userTier = await this.synchronizer.getUserTier();
      console.log(`[Orchestrator] User tier: ${userTier}`);

      // [TIER ACCESS] Filter traders by tier access
      const filteredTraders = this.filterTradersByTier(
        allTraders,
        userTier,
        this.config.userId
      );

      // [TIER ACCESS] Log filter results
      const blockedCount = allTraders.length - filteredTraders.length;
      if (blockedCount > 0) {
        const blockedNames = allTraders
          .filter(t => !filteredTraders.includes(t))
          .map(t => t.name)
          .join(', ');
        console.log(`[Orchestrator] Tier filter blocked ${blockedCount} traders: ${blockedNames}`);
      }

      this.traders = filteredTraders as CloudTrader[];
      console.log(`[Orchestrator] Loaded ${this.traders.length} accessible traders`);

    // DEBUG: Log raw trader structure from database
    if (this.traders.length > 0) {
      const sample = this.traders[0] as any;
      console.log(`[Orchestrator] DEBUG - Sample trader structure:`, JSON.stringify({
        id: sample.id,
        name: sample.name,
        hasFilter: !!sample.filter,
        filterType: typeof sample.filter,
        filterKeys: sample.filter ? Object.keys(sample.filter) : [],
        filterCode: sample.filter?.code ? `${sample.filter.code.substring(0, 50)}...` : 'MISSING',
        refreshInterval: sample.filter?.refreshInterval || 'MISSING',
        requiredTimeframes: sample.filter?.requiredTimeframes || 'MISSING'
      }, null, 2));
    }

    // Log trader configurations
    for (const trader of this.traders) {
      const traderAny = trader as any;
      console.log(`[Orchestrator]   Trader "${trader.name}":`);
      console.log(`[Orchestrator]     Refresh interval: ${traderAny.refreshInterval || traderAny.filter?.refreshInterval || 'unknown'}`);
      const timeframes = traderAny.requiredTimeframes || traderAny.filter?.requiredTimeframes;
      if (timeframes && timeframes.length > 0) {
        console.log(`[Orchestrator]     Required timeframes: ${timeframes.join(', ')}`);
      }
    }

      // Update synchronizer event
      this.synchronizer.queueEvent(
        'config_synced',
        'info',
        `Loaded ${this.traders.length} accessible traders (${blockedCount} blocked by tier)`
      );

    } catch (error) {
      console.error('[Orchestrator] Failed to reload traders:', error);
      // Keep existing traders, don't crash machine
    }
  }

  /**
   * Filter traders based on user's tier access
   * Implements same logic as browser-side filtering
   *
   * @param traders - All traders to filter
   * @param userTier - User's subscription tier
   * @param userId - User ID for ownership checks
   * @returns Filtered traders user can access
   */
  private filterTradersByTier(
    traders: any[],
    userTier: 'anonymous' | 'free' | 'pro' | 'elite',
    userId: string
  ): any[] {
    const TIER_HIERARCHY = ['anonymous', 'free', 'pro', 'elite'];

    return traders.filter(trader => {
      // Custom signals: creator always has access
      if (trader.userId && trader.userId === userId) {
        return true;
      }

      // Built-in signals: check tier hierarchy
      const requiredTier = trader.accessTier || trader.access_tier || 'free';
      const userLevel = TIER_HIERARCHY.indexOf(userTier);
      const requiredLevel = TIER_HIERARCHY.indexOf(requiredTier);

      return userLevel >= requiredLevel;
    });
  }

  private determineRequiredIntervals(): string[] {
    const intervals = new Set<string>();

    // Collect intervals from all enabled traders (matching browser behavior)
    this.traders.forEach(trader => {
      if (trader.enabled) {
        const traderAny = trader as any;

        // Add refresh interval
        const refreshInterval = traderAny.refreshInterval ||
                              traderAny.filter?.refreshInterval ||
                              traderAny.filter?.interval ||
                              '1m';
        intervals.add(refreshInterval);

        // Add all required timeframes
        const requiredTimeframes = traderAny.requiredTimeframes ||
                                  traderAny.filter?.requiredTimeframes ||
                                  [];
        requiredTimeframes.forEach((tf: string) => intervals.add(tf));
      }
    });

    // Always include 1m as fallback (matching browser)
    intervals.add('1m');

    return Array.from(intervals);
  }

  private startScreeningLoop(): void {
    this.screeningInterval = setInterval(() => {
      if (!this.isPaused && this.isRunning) {
        this.runScreening();
      }
    }, this.config.screeningIntervalMs);

    // Run first screening immediately
    this.runScreening();
  }

  private async runScreening(): Promise<void> {
    if (this.traders.length === 0) {
      return; // No traders to screen
    }

    const startTime = Date.now();
    this.lastScreeningTime = new Date();

    try {
      // Get current market data
      const marketData = this.binance.getMarketData();

      // Log kline data stats every minute
      if (this.metrics.totalScreenings % 1 === 0) { // Every screening (every minute)
        this.logKlineDataStats(marketData);
      }

      // Execute filters in parallel
      const results = await this.screener.executeFilters(this.traders, marketData);

      // Update metrics
      this.metrics.totalScreenings++;

      // Process results
      await this.handleScreeningResults(results);

      // Record metrics for scaler
      const executionTime = Date.now() - startTime;
      const queueDepth = this.analyzer.getQueueDepth();
      const screenerStats = this.screener.getStats();

      this.scaler.recordMetrics({
        signalQueueDepth: results.size,
        analysisQueueDepth: queueDepth,
        activeWorkers: screenerStats.busyWorkers,
        cpuUsage: this.healthMonitor.getHealth().metrics.cpuUsage,
        memoryUsage: this.healthMonitor.getHealth().metrics.memoryUsage
      });

      console.log(`[Orchestrator] Screening complete: ${results.size} results in ${executionTime}ms`);

    } catch (error) {
      console.error('[Orchestrator] Screening failed:', error);
      this.healthMonitor.recordError('orchestrator', `Screening failed: ${error}`);
      this.metrics.errors++;
    }
  }

  private logKlineDataStats(marketData: MarketData): void {
    const symbolsWithKlines = Array.from(marketData.klines.keys());
    const totalSymbols = symbolsWithKlines.length;

    if (totalSymbols === 0) {
      console.warn('[Orchestrator] ⚠️  NO KLINE DATA AVAILABLE!');
      return;
    }

    // Sample first 3 symbols to check kline availability
    const sampleSymbols = symbolsWithKlines.slice(0, 3);
    const klineStats: any[] = [];

    for (const symbol of sampleSymbols) {
      const intervals = marketData.klines.get(symbol);
      if (intervals) {
        const intervalData: any = {};
        intervals.forEach((klines, interval) => {
          intervalData[interval] = klines.length;
        });
        klineStats.push({ symbol, intervals: intervalData });
      }
    }

    console.log(`[Orchestrator] 📊 Kline Data Stats:`);
    console.log(`[Orchestrator]   Symbols with data: ${totalSymbols}/${marketData.symbols.length}`);
    console.log(`[Orchestrator]   Sample kline counts:`, JSON.stringify(klineStats, null, 2));

    // Check if traders need specific intervals
    const traderIntervals = new Set<string>();
    this.traders.forEach(trader => {
      const traderAny = trader as any;
      const timeframes = traderAny.requiredTimeframes || traderAny.filter?.requiredTimeframes;
      if (timeframes) {
        timeframes.forEach((interval: string) => traderIntervals.add(interval));
      }
    });

    if (traderIntervals.size > 0) {
      console.log(`[Orchestrator]   Traders require intervals: ${Array.from(traderIntervals).join(', ')}`);

      // Check if any required intervals are missing
      const firstSymbol = symbolsWithKlines[0];
      const availableIntervals = marketData.klines.get(firstSymbol);
      if (availableIntervals) {
        const available = Array.from(availableIntervals.keys());
        const missing = Array.from(traderIntervals).filter(interval => !available.includes(interval));
        if (missing.length > 0) {
          console.error(`[Orchestrator]   ❌ MISSING INTERVALS: ${missing.join(', ')}`);
        }
      }
    }
  }

  private async handleScreeningResults(results: Map<string, TraderResult>): Promise<void> {
    console.log(`[Orchestrator] Processing ${results.size} trader results...`);

    let totalNewSignals = 0;

    for (const [traderId, result] of results.entries()) {
      if (result.error) {
        console.error(`[Orchestrator] Trader ${result.traderName} error:`, result.error);
        continue;
      }

      // Log trader result summary
      console.log(`[Orchestrator]   Trader "${result.traderName}": ${result.matches.length} new signals`);

      // Process matches
      for (const match of result.matches) {
        // Create signal record
        const signal = {
          trader_id: traderId,
          symbol: match.symbol,
          price: match.price,
          matched_conditions: match.matchedConditions || [],
          status: 'new',
          source: 'cloud',
          machine_id: this.config.machineConfig.machineId,
          created_at: new Date().toISOString()
        };

        console.log(`[Orchestrator]     → Queueing signal: ${match.symbol} @ $${match.price}`);

        // Queue signal for database write
        this.synchronizer.queueSignal(signal);

        // Queue for AI analysis
        const signalId = `signal_${Date.now()}_${traderId}_${match.symbol}`;
        await this.analyzer.analyzeSignal(signalId, traderId, match.symbol);

        // Broadcast to browser
        this.wsServer.broadcastSignalCreated({
          signalId,
          traderId,
          symbol: match.symbol,
          price: match.price
        });

        this.metrics.totalSignals++;
        totalNewSignals++;
      }
    }

    console.log(`[Orchestrator] Total new signals this cycle: ${totalNewSignals}`);
  }

  private handleAnalysisComplete(result: any): void {
    console.log('[Orchestrator] Analysis complete:', result.signalId);

    // Track analysis in synchronizer metrics
    this.synchronizer.incrementAnalysisCount();

    // Broadcast to browser
    this.wsServer.broadcastAnalysisCompleted({
      signalId: result.signalId,
      decision: result.result?.decision || 'unknown',
      confidence: result.result?.confidence || 0,
      reasoning: result.result?.reasoning,
      tradePlan: result.result?.tradePlan
    });

    this.metrics.totalAnalyses++;

    // Log detailed analysis result
    if (result.result) {
      console.log(`[Orchestrator]   Decision: ${result.result.decision}`);
      console.log(`[Orchestrator]   Confidence: ${result.result.confidence}%`);
      console.log(`[Orchestrator]   Reasoning: ${result.result.reasoning?.substring(0, 100)}...`);
    }
  }

  pause(): void {
    if (!this.isRunning || this.isPaused) {
      return;
    }

    console.log('[Orchestrator] Pausing...');
    this.isPaused = true;

    this.wsServer.broadcastStatusUpdate(
      'paused',
      this.config.machineConfig.cpus,
      Date.now() - (this.healthMonitor.getHealth().uptime || 0)
    );

    console.log('[Orchestrator] Paused');
  }

  resume(): void {
    if (!this.isRunning || !this.isPaused) {
      return;
    }

    console.log('[Orchestrator] Resuming...');
    this.isPaused = false;

    this.wsServer.broadcastStatusUpdate(
      'running',
      this.config.machineConfig.cpus,
      Date.now() - (this.healthMonitor.getHealth().uptime || 0)
    );

    console.log('[Orchestrator] Resumed');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('[Orchestrator] Stopping...');
    this.isRunning = false;

    // Stop screening loop
    if (this.screeningInterval) {
      clearInterval(this.screeningInterval);
      this.screeningInterval = null;
    }

    // Shutdown all services in reverse order
    try {
      // 1. Stop Edge Function health ping
      await this.edgeFunctionPing.stop();

      // 2. Disconnect Binance WebSocket
      await this.binance.disconnect();

      // 3. Stop WebSocket server
      await this.wsServer.stop();

      // 4. Shutdown dynamic scaler
      await this.scaler.shutdown();

      // 5. Shutdown concurrent analyzer
      await this.analyzer.shutdown();

      // 6. Flush and shutdown synchronizer
      await this.synchronizer.flush();
      await this.synchronizer.shutdown();

      // 7. Shutdown parallel screener
      await this.screener.shutdown();

      // 8. Stop health monitor
      await this.healthMonitor.stop();

      console.log('[Orchestrator] Stopped');

    } catch (error) {
      console.error('[Orchestrator] Error during shutdown:', error);
      throw error;
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      userId: this.config.userId,
      machineId: this.config.machineConfig.machineId,
      traderCount: this.traders.length,
      symbolCount: this.config.symbols.length,
      lastScreening: this.lastScreeningTime,
      metrics: { ...this.metrics },
      health: this.healthMonitor.getHealth(),
      traders: this.traders, // Include full trader array for debug endpoint
      services: {
        binance: this.binance.getStats(),
        screener: this.screener.getStats(),
        analyzer: this.analyzer.getStats(),
        synchronizer: this.synchronizer.getStats(),
        scaler: this.scaler.getStats(),
        healthMonitor: this.healthMonitor.getStats(),
        wsServer: this.wsServer.getStats(),
        edgeFunctionPing: this.edgeFunctionPing.getStats()
      }
    };
  }
}
