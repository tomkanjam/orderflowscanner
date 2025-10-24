/**
 * Concurrent Analyzer - Strategy 3: Concurrent AI Analysis
 * Manages AI analysis queue with concurrency limits and rate limiting
 */

import { EventEmitter } from 'events';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  IConcurrentAnalyzer,
  AnalysisQueueItem,
  AnalysisQueue,
  AnalysisResponse
} from '../types';

interface AnalysisTask {
  id: string;
  signalId: string;
  traderId: string;
  symbol: string;
  priority: 'low' | 'normal' | 'high';
  retryCount: number;
  startedAt?: Date;
  promise?: Promise<any>;
}

export class ConcurrentAnalyzer extends EventEmitter implements IConcurrentAnalyzer {
  private supabase: SupabaseClient;
  private queue: AnalysisTask[] = [];
  private activeTasks = new Map<string, AnalysisTask>();

  private config = {
    maxConcurrent: 4, // Max 4 concurrent Gemini API calls
    maxQueueSize: 100,
    taskTimeout: 30000, // 30 seconds
    retryAttempts: 3,
    retryDelay: 2000
  };

  private rateLimiter = {
    requestsPerMinute: 60, // Gemini API limit
    windowStart: Date.now(),
    requestCount: 0
  };

  private isShuttingDown = false;
  private processingLoop: NodeJS.Timeout | null = null;

  constructor() {
    super();

    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async initialize(): Promise<void> {
    console.log('[ConcurrentAnalyzer] Initializing...');

    // Start processing loop
    this.startProcessingLoop();

    console.log(`[ConcurrentAnalyzer] Initialized with max ${this.config.maxConcurrent} concurrent tasks`);
  }

  private startProcessingLoop(): void {
    this.processingLoop = setInterval(() => {
      if (!this.isShuttingDown) {
        this.processQueue();
      }
    }, 100); // Check every 100ms
  }

  private async processQueue(): Promise<void> {
    // Check if we can process more tasks
    while (
      this.activeTasks.size < this.config.maxConcurrent &&
      this.queue.length > 0 &&
      this.canMakeRequest()
    ) {
      // Get highest priority task
      const task = this.getNextTask();
      if (!task) break;

      // Execute task
      this.executeTask(task);
    }
  }

  private getNextTask(): AnalysisTask | null {
    if (this.queue.length === 0) return null;

    // Sort by priority (high > normal > low) then by creation time
    this.queue.sort((a, b) => {
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      const aPriority = priorityOrder[a.priority];
      const bPriority = priorityOrder[b.priority];

      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }

      // Same priority - use FIFO
      return 0;
    });

    return this.queue.shift() || null;
  }

  private canMakeRequest(): boolean {
    const now = Date.now();
    const windowDuration = 60000; // 1 minute

    // Reset window if expired
    if (now - this.rateLimiter.windowStart >= windowDuration) {
      this.rateLimiter.windowStart = now;
      this.rateLimiter.requestCount = 0;
    }

    // Check if under rate limit
    return this.rateLimiter.requestCount < this.rateLimiter.requestsPerMinute;
  }

  private async executeTask(task: AnalysisTask): Promise<void> {
    task.startedAt = new Date();
    this.activeTasks.set(task.id, task);
    this.rateLimiter.requestCount++;

    const promise = this.callAnalysisEdgeFunction(task)
      .then(result => {
        this.handleTaskSuccess(task, result);
        return result;
      })
      .catch(error => {
        this.handleTaskError(task, error);
      })
      .finally(() => {
        this.activeTasks.delete(task.id);
      });

    task.promise = promise;
  }

  private async callAnalysisEdgeFunction(task: AnalysisTask): Promise<any> {
    const correlationId = `${task.signalId}_${Date.now()}`;

    console.log(`[ConcurrentAnalyzer] [${correlationId}] Calling AI Analysis Edge Function for ${task.symbol}`);

    try {
      // 1. Load trader to get strategy and required indicators
      const { data: trader, error: traderError } = await this.supabase
        .from('traders')
        .select('strategy, filter')
        .eq('id', task.traderId)
        .single();

      if (traderError || !trader) {
        throw new Error(`Failed to load trader ${task.traderId}: ${traderError?.message || 'Not found'}`);
      }

      // 2. Load signal to get current price and match details
      const { data: signal, error: signalError } = await this.supabase
        .from('signals')
        .select('price, matched_conditions')
        .eq('id', task.signalId)
        .single();

      if (signalError || !signal) {
        throw new Error(`Failed to load signal ${task.signalId}: ${signalError?.message || 'Not found'}`);
      }

      // 3. Fetch historical klines (last 100 candles for AI analysis)
      const klines = await this.fetchKlinesForSymbol(task.symbol, 100);

      // 4. Calculate indicators based on trader's configuration
      const calculatedIndicators = this.calculateIndicators(
        klines,
        trader.filter?.indicators || []
      );

      // 5. Build Edge Function request payload
      const requestPayload = {
        signalId: task.signalId,
        traderId: task.traderId,
        userId: '', // Will be filled from context if needed
        symbol: task.symbol,
        price: signal.price,
        klines,
        strategy: trader.strategy || 'No strategy provided',
        calculatedIndicators,
        priority: task.priority,
        correlationId
      };

      // 6. Call Edge Function
      const edgeFunctionUrl = process.env.SUPABASE_EDGE_FUNCTION_URL ||
        `${process.env.SUPABASE_URL}/functions/v1/ai-analysis`;

      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'x-correlation-id': correlationId
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Edge Function error (${response.status}): ${errorText}`);
      }

      const analysisResponse = await response.json() as AnalysisResponse;

      console.log(`[ConcurrentAnalyzer] [${correlationId}] Analysis received: ${analysisResponse.decision} (confidence: ${analysisResponse.confidence})`);

      // 7. Write analysis to signal_analyses table
      const { error: writeError } = await this.supabase
        .from('signal_analyses')
        .insert({
          signal_id: task.signalId,
          trader_id: task.traderId,
          user_id: requestPayload.userId || '', // Use userId from request
          decision: analysisResponse.decision,
          confidence: analysisResponse.confidence,
          reasoning: analysisResponse.reasoning,
          key_levels: analysisResponse.keyLevels,
          trade_plan: analysisResponse.tradePlan,
          technical_indicators: analysisResponse.technicalIndicators,
          raw_ai_response: analysisResponse.metadata.rawAiResponse,
          analysis_latency_ms: analysisResponse.metadata.analysisLatencyMs,
          gemini_tokens_used: analysisResponse.metadata.geminiTokensUsed,
          model_name: analysisResponse.metadata.modelName
        });

      if (writeError) {
        console.error(`[ConcurrentAnalyzer] [${correlationId}] Failed to write analysis:`, writeError);
        // Don't throw - analysis succeeded even if write failed
      } else {
        console.log(`[ConcurrentAnalyzer] [${correlationId}] Analysis written to database`);
      }

      return analysisResponse;

    } catch (error) {
      console.error(`[ConcurrentAnalyzer] [${correlationId}] Edge Function call failed:`, error);
      throw error;
    }
  }

  /**
   * Fetch historical klines for a symbol
   */
  private async fetchKlinesForSymbol(symbol: string, limit: number): Promise<any[]> {
    // TODO: Implement kline fetching from Binance or cache
    // For now, return empty array as placeholder
    console.warn(`[ConcurrentAnalyzer] Kline fetching not yet implemented for ${symbol}`);
    return [];
  }

  /**
   * Calculate technical indicators based on trader configuration
   */
  private calculateIndicators(klines: any[], indicatorConfigs: any[]): any {
    // TODO: Implement indicator calculations using screenerHelpers
    // For now, return empty object as placeholder
    console.warn(`[ConcurrentAnalyzer] Indicator calculation not yet implemented`);
    return {};
  }

  private handleTaskSuccess(task: AnalysisTask, result: any): void {
    const duration = task.startedAt ? Date.now() - task.startedAt.getTime() : 0;

    console.log(`[ConcurrentAnalyzer] Analysis complete for signal ${task.signalId} (${duration}ms)`);

    this.emit('analysis_complete', {
      signalId: task.signalId,
      traderId: task.traderId,
      symbol: task.symbol,
      result,
      duration
    });
  }

  private handleTaskError(task: AnalysisTask, error: any): void {
    console.error(`[ConcurrentAnalyzer] Analysis failed for signal ${task.signalId}:`, error);

    // Retry if under retry limit
    if (task.retryCount < this.config.retryAttempts) {
      console.log(`[ConcurrentAnalyzer] Retrying signal ${task.signalId} (attempt ${task.retryCount + 1}/${this.config.retryAttempts})`);

      // Add back to queue with incremented retry count
      setTimeout(() => {
        if (!this.isShuttingDown) {
          this.queue.push({
            ...task,
            retryCount: task.retryCount + 1,
            startedAt: undefined,
            promise: undefined
          });
        }
      }, this.config.retryDelay * (task.retryCount + 1)); // Exponential backoff
    } else {
      this.emit('analysis_failed', {
        signalId: task.signalId,
        traderId: task.traderId,
        symbol: task.symbol,
        error: error.message || String(error)
      });
    }
  }

  async analyzeSignal(signalId: string, traderId: string, symbol: string, priority: 'low' | 'normal' | 'high' = 'normal'): Promise<any> {
    if (this.isShuttingDown) {
      throw new Error('ConcurrentAnalyzer is shutting down');
    }

    if (this.queue.length >= this.config.maxQueueSize) {
      throw new Error('Analysis queue is full');
    }

    const task: AnalysisTask = {
      id: `${signalId}-${Date.now()}`,
      signalId,
      traderId,
      symbol,
      priority,
      retryCount: 0
    };

    // Add to queue
    this.queue.push(task);

    console.log(`[ConcurrentAnalyzer] Queued analysis for signal ${signalId} (queue depth: ${this.queue.length})`);

    // Return a promise that resolves when task completes
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Analysis timeout for signal ${signalId}`));
      }, this.config.taskTimeout);

      const handleComplete = (event: any) => {
        if (event.signalId === signalId) {
          clearTimeout(timeout);
          this.removeListener('analysis_complete', handleComplete);
          this.removeListener('analysis_failed', handleFailed);
          resolve(event.result);
        }
      };

      const handleFailed = (event: any) => {
        if (event.signalId === signalId) {
          clearTimeout(timeout);
          this.removeListener('analysis_complete', handleComplete);
          this.removeListener('analysis_failed', handleFailed);
          reject(new Error(event.error));
        }
      };

      this.on('analysis_complete', handleComplete);
      this.on('analysis_failed', handleFailed);
    });
  }

  getQueueDepth(): number {
    return this.queue.length + this.activeTasks.size;
  }

  getStats() {
    return {
      queueDepth: this.queue.length,
      activeTasks: this.activeTasks.size,
      requestsThisMinute: this.rateLimiter.requestCount,
      maxConcurrent: this.config.maxConcurrent
    };
  }

  async shutdown(): Promise<void> {
    console.log('[ConcurrentAnalyzer] Shutting down...');
    this.isShuttingDown = true;

    // Stop processing loop
    if (this.processingLoop) {
      clearInterval(this.processingLoop);
      this.processingLoop = null;
    }

    // Wait for active tasks to complete (with timeout)
    const timeout = 30000; // 30 seconds
    const startTime = Date.now();

    while (this.activeTasks.size > 0 && Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.activeTasks.size > 0) {
      console.warn(`[ConcurrentAnalyzer] ${this.activeTasks.size} tasks still active after timeout`);
    }

    // Clear queue
    this.queue = [];

    console.log('[ConcurrentAnalyzer] Shutdown complete');
  }
}
