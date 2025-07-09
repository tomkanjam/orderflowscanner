import { supabase, isSupabaseConfigured } from '../config/supabase';
import { klineEventBus, KlineCloseEvent } from './klineEventBus';
import { signalManager } from './signalManager';
import { tradeManager } from './tradeManager';
import { traderManager } from './traderManager';
import { KlineInterval } from '../../types';
import { getSymbolAnalysis } from '../../services/geminiService';
import { getPositionContext } from '../utils/positionContext';

export interface WorkflowSchedule {
  id: string;
  workflow_type: 'signal_monitoring' | 'position_management';
  entity_id: string; // signal_id or position_id
  trader_id: string;
  symbol: string;
  interval: string;
  last_run_at?: Date;
  last_candle_time?: number;
  consecutive_errors: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface MonitoringDecision {
  id: string;
  signal_id: string;
  timestamp: Date;
  price: number;
  decision: 'enter' | 'continue' | 'abandon';
  confidence: number;
  reasoning: string;
  trade_plan?: {
    entry: number;
    stopLoss: number;
    takeProfit: number;
    positionSize: number;
  };
  indicators: Record<string, number>;
  created_at: Date;
}

export interface ManagementDecision {
  id: string;
  position_id: string;
  signal_id?: string;
  timestamp: Date;
  action: 'hold' | 'adjust_sl' | 'adjust_tp' | 'reduce' | 'close';
  confidence: number;
  reasoning: string;
  action_details?: Record<string, any>;
  current_pnl: number;
  current_pnl_pct: number;
  market_price: number;
  indicators: Record<string, number>;
  created_at: Date;
}

class WorkflowManager {
  private static instance: WorkflowManager;
  private activeWorkflows: Map<string, WorkflowSchedule> = new Map();
  private subscriptions: Map<string, () => void> = new Map();
  private initialized = false;
  // Store monitoring decisions in memory for local mode
  private localMonitoringDecisions: Map<string, MonitoringDecision[]> = new Map();

  private constructor() {}

  static getInstance(): WorkflowManager {
    if (!WorkflowManager.instance) {
      WorkflowManager.instance = new WorkflowManager();
    }
    return WorkflowManager.instance;
  }

  async initialize() {
    if (this.initialized) return;
    
    if (!isSupabaseConfigured()) {
      console.warn('[WorkflowManager] Supabase not configured, running in local mode');
      // Still set up signal subscriptions for local operation
      this.setupSignalSubscriptions();
      this.initialized = true;
      return;
    }
    
    // Load active workflows from database
    await this.loadActiveWorkflows();
    
    // Subscribe to signal lifecycle events
    this.setupSignalSubscriptions();
    
    this.initialized = true;
    console.log('[WorkflowManager] Initialized with', this.activeWorkflows.size, 'active workflows');
  }

  private async loadActiveWorkflows() {
    if (!isSupabaseConfigured() || !supabase) return;
    
    try {
      const { data, error } = await supabase
        .from('workflow_schedules')
        .select('*')
        .eq('is_active', true);

      if (error) {
        console.error('[WorkflowManager] Error loading workflows:', error);
        return;
      }

      if (data) {
        data.forEach(workflow => {
          this.activeWorkflows.set(workflow.id, workflow);
          // Subscribe to kline events for this workflow
          this.subscribeToWorkflow(workflow);
        });
      }
    } catch (error) {
      console.error('[WorkflowManager] Failed to load workflows:', error);
    }
  }

  private setupSignalSubscriptions() {
    // Listen for signal status changes
    signalManager.subscribe(signals => {
      signals.forEach(signal => {
        if (signal.status === 'monitoring' && !this.hasMonitoringWorkflow(signal.id)) {
          // Create monitoring workflow
          this.createMonitoringWorkflow(signal);
        } else if (signal.status === 'closed' || signal.status === 'expired') {
          // Cancel monitoring workflow
          this.cancelWorkflowForEntity('signal_monitoring', signal.id);
        }
      });
    });
  }
  
  // Local storage for demo mode
  private createLocalWorkflow(workflow: Partial<WorkflowSchedule>): WorkflowSchedule {
    const newWorkflow: WorkflowSchedule = {
      id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      workflow_type: workflow.workflow_type!,
      entity_id: workflow.entity_id!,
      trader_id: workflow.trader_id!,
      symbol: workflow.symbol!,
      interval: workflow.interval!,
      consecutive_errors: 0,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    this.activeWorkflows.set(newWorkflow.id, newWorkflow);
    this.subscribeToWorkflow(newWorkflow);
    
    return newWorkflow;
  }

  private hasMonitoringWorkflow(signalId: string): boolean {
    return Array.from(this.activeWorkflows.values()).some(
      w => w.workflow_type === 'signal_monitoring' && w.entity_id === signalId
    );
  }

  private subscribeToWorkflow(workflow: WorkflowSchedule) {
    const key = `${workflow.symbol}:${workflow.interval}`;
    
    if (this.subscriptions.has(key)) {
      return; // Already subscribed
    }

    const unsubscribe = klineEventBus.subscribe(
      workflow.symbol,
      workflow.interval as KlineInterval,
      async (event) => {
        await this.handleKlineClose(event);
      }
    );

    this.subscriptions.set(key, unsubscribe);
  }

  private async handleKlineClose(event: KlineCloseEvent) {
    const { symbol, interval, kline } = event;
    const candleTime = kline[0]; // Open time
    
    // Find workflows for this symbol/interval
    const workflows = Array.from(this.activeWorkflows.values()).filter(
      w => w.symbol === symbol && w.interval === interval && w.is_active
    );

    if (workflows.length === 0) return;

    console.log(`[WorkflowManager] Processing ${workflows.length} workflows for ${symbol} ${interval} candle close`);

    // Process workflows in parallel
    await Promise.all(
      workflows.map(workflow => this.processWorkflow(workflow, kline, candleTime))
    );
  }

  private async processWorkflow(workflow: WorkflowSchedule, kline: number[], candleTime: number) {
    // Check if we already processed this candle
    if (workflow.last_candle_time && candleTime <= workflow.last_candle_time) {
      return; // Already processed
    }

    try {
      // Update last run info
      await this.updateWorkflowRun(workflow.id, candleTime);

      switch (workflow.workflow_type) {
        case 'signal_monitoring':
          await this.executeSignalMonitoring(workflow, kline);
          break;
        case 'position_management':
          await this.executePositionManagement(workflow, kline);
          break;
      }

      // Reset error count on success
      if (workflow.consecutive_errors > 0) {
        await this.updateWorkflowErrors(workflow.id, 0);
      }
    } catch (error) {
      console.error(`[WorkflowManager] Error processing workflow ${workflow.id}:`, error);
      await this.handleWorkflowError(workflow, error as Error);
    }
  }

  private async executeSignalMonitoring(workflow: WorkflowSchedule, kline: number[]) {
    const signal = signalManager.getSignalById(workflow.entity_id);
    if (!signal || signal.status !== 'monitoring') {
      await this.deactivateWorkflow(workflow.id);
      return;
    }

    // Get trader configuration
    const trader = await this.getTrader(workflow.trader_id);
    
    if (!trader) {
      console.error('[WorkflowManager] Trader not found:', workflow.trader_id);
      return;
    }

    // Build monitoring prompt
    const prompt = await this.buildMonitoringPrompt(signal, trader, kline);
    
    // Get AI analysis
    const analysis = await getSymbolAnalysis(
      signal.symbol,
      null, // ticker will be fetched internally
      null, // historicalData will be fetched internally
      prompt,
      trader.ai_model || 'gemini-2.5-flash',
      workflow.interval as KlineInterval,
      100, // kline limit
      trader.indicators
    );

    // Parse decision from analysis
    const decision = this.parseMonitoringDecision(analysis);
    
    // Record decision
    await this.recordMonitoringDecision(signal.id, kline, decision);

    // Execute decision
    switch (decision.decision) {
      case 'enter':
        // Update signal to ready status
        signalManager.updateSignalStatus(signal.id, 'ready');
        // The signal lifecycle will handle trade creation
        await this.deactivateWorkflow(workflow.id);
        break;
        
      case 'abandon':
        signalManager.updateSignalStatus(signal.id, 'expired');
        await this.deactivateWorkflow(workflow.id);
        break;
        
      case 'continue':
        // Just continue monitoring
        console.log(`[WorkflowManager] Continuing to monitor ${signal.symbol}`);
        break;
    }
  }

  private async executePositionManagement(workflow: WorkflowSchedule, kline: number[]) {
    // Position management would be implemented similarly
    // This requires integration with CCXT for real trading
    console.log('[WorkflowManager] Position management not yet implemented');
  }

  private async buildMonitoringPrompt(signal: any, trader: any, kline: number[]): Promise<string> {
    const closePrice = kline[4];
    const priceChange = ((closePrice - signal.initialPrice) / signal.initialPrice) * 100;
    
    // Get position context for this symbol
    const positionCtx = await getPositionContext(signal.symbol);
    
    // Import trader persona
    const { enhancePromptWithPersona } = await import('../constants/traderPersona');
    
    const basePrompt = `MONITORING UPDATE: ${trader.filter?.interval || '1m'} candle has just closed for ${signal.symbol}.

SIGNAL CONTEXT:
- Symbol: ${signal.symbol}
- Initial Signal Price: $${signal.initialPrice}
- Current Price: $${closePrice}
- Price Movement: ${priceChange.toFixed(2)}%
- Time in Monitoring: ${this.getTimeElapsed(signal.createdAt)}
- Original Conditions: ${signal.matchedConditions?.join(', ') || 'N/A'}

${positionCtx.formattedText}

Just Closed Candle:
- Open: ${kline[1]}
- High: ${kline[2]}
- Low: ${kline[3]}
- Close: ${kline[4]}
- Volume: ${kline[5]}

TRADER'S STRATEGY FOR THIS POSITION:
${trader.strategy || 'Follow standard technical analysis principles'}

REQUIRED DECISION:
Based on your expertise and the current market conditions, make one of these decisions:
1. ENTER: Confluence achieved, execute the trade now
2. CONTINUE: Setup still valid but needs more development
3. ABANDON: Setup invalidated, move on to next opportunity

FORMAT YOUR RESPONSE:
DECISION: [ENTER/CONTINUE/ABANDON]
CONFIDENCE: [0-100]%
REASONING: [Your analysis based on your trading experience]

If ENTER, provide execution details:
ENTRY: [exact price]
STOP_LOSS: [exact price with reasoning]
TAKE_PROFIT: [exact price(s) with reasoning]`;

    // Apply trader persona
    return enhancePromptWithPersona(basePrompt);
  }

  private parseMonitoringDecision(analysis: string): Partial<MonitoringDecision> {
    const lines = analysis.split('\n');
    const decision: Partial<MonitoringDecision> = {
      decision: 'continue',
      confidence: 50,
      reasoning: analysis
    };

    for (const line of lines) {
      if (line.startsWith('DECISION:')) {
        const value = line.replace('DECISION:', '').trim().toLowerCase();
        if (value === 'enter' || value === 'continue' || value === 'abandon') {
          decision.decision = value;
        }
      } else if (line.startsWith('CONFIDENCE:')) {
        const value = parseFloat(line.replace('CONFIDENCE:', '').replace('%', '').trim());
        if (!isNaN(value)) {
          decision.confidence = value;
        }
      } else if (line.startsWith('REASONING:')) {
        decision.reasoning = line.replace('REASONING:', '').trim();
      } else if (line.startsWith('ENTRY:')) {
        const value = parseFloat(line.replace('ENTRY:', '').trim());
        if (!isNaN(value)) {
          if (!decision.trade_plan) {
            decision.trade_plan = {} as any;
          }
          decision.trade_plan.entry = value;
        }
      } else if (line.startsWith('STOP_LOSS:')) {
        const value = parseFloat(line.replace('STOP_LOSS:', '').trim());
        if (!isNaN(value)) {
          if (!decision.trade_plan) {
            decision.trade_plan = {} as any;
          }
          decision.trade_plan.stopLoss = value;
        }
      } else if (line.startsWith('TAKE_PROFIT:')) {
        const value = parseFloat(line.replace('TAKE_PROFIT:', '').trim());
        if (!isNaN(value)) {
          if (!decision.trade_plan) {
            decision.trade_plan = {} as any;
          }
          decision.trade_plan.takeProfit = value;
        }
      }
    }

    return decision;
  }

  private getTimeElapsed(startTime: Date): string {
    const elapsed = Date.now() - startTime.getTime();
    const hours = Math.floor(elapsed / (1000 * 60 * 60));
    const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }
  
  private async getTrader(traderId: string): Promise<any> {
    try {
      const traders = await traderManager.getTraders();
      return traders.find(t => t.id === traderId);
    } catch (error) {
      console.error('[WorkflowManager] Error getting trader:', error);
      return null;
    }
  }

  async createMonitoringWorkflow(signal: any) {
    try {
      const workflow: Partial<WorkflowSchedule> = {
        workflow_type: 'signal_monitoring',
        entity_id: signal.id,
        trader_id: signal.traderId,
        symbol: signal.symbol,
        interval: signal.interval || '1m',
        consecutive_errors: 0,
        is_active: true
      };

      // Local mode if Supabase not configured
      if (!isSupabaseConfigured() || !supabase) {
        const localWorkflow = this.createLocalWorkflow(workflow);
        console.log(`[WorkflowManager] Created local monitoring workflow for ${signal.symbol}`);
        return;
      }

      const { data, error } = await supabase
        .from('workflow_schedules')
        .insert([workflow])
        .select()
        .single();

      if (error) {
        console.error('[WorkflowManager] Error creating workflow:', error);
        // Fall back to local mode
        const localWorkflow = this.createLocalWorkflow(workflow);
        console.log(`[WorkflowManager] Created local monitoring workflow for ${signal.symbol} (fallback)`);
        return;
      }

      if (data) {
        this.activeWorkflows.set(data.id, data);
        this.subscribeToWorkflow(data);
        console.log(`[WorkflowManager] Created monitoring workflow for ${signal.symbol}`);
      }
    } catch (error) {
      console.error('[WorkflowManager] Failed to create workflow:', error);
      // Fall back to local mode
      const localWorkflow = this.createLocalWorkflow(workflow);
      console.log(`[WorkflowManager] Created local monitoring workflow for ${signal.symbol} (fallback)`);
    }
  }

  async cancelWorkflowForEntity(workflowType: string, entityId: string) {
    const workflows = Array.from(this.activeWorkflows.values()).filter(
      w => w.workflow_type === workflowType && w.entity_id === entityId
    );

    for (const workflow of workflows) {
      await this.deactivateWorkflow(workflow.id);
    }
  }

  private async deactivateWorkflow(workflowId: string) {
    try {
      // For local workflows, just remove from memory
      if (workflowId.startsWith('local-')) {
        this.activeWorkflows.delete(workflowId);
        console.log(`[WorkflowManager] Deactivated local workflow ${workflowId}`);
        return;
      }
      
      if (isSupabaseConfigured() && supabase) {
        await supabase
          .from('workflow_schedules')
          .update({ is_active: false, updated_at: new Date() })
          .eq('id', workflowId);
      }

      this.activeWorkflows.delete(workflowId);
      console.log(`[WorkflowManager] Deactivated workflow ${workflowId}`);
    } catch (error) {
      console.error('[WorkflowManager] Error deactivating workflow:', error);
    }
  }

  private async updateWorkflowRun(workflowId: string, candleTime: number) {
    try {
      // Update local cache first
      const workflow = this.activeWorkflows.get(workflowId);
      if (workflow) {
        workflow.last_run_at = new Date();
        workflow.last_candle_time = candleTime;
      }
      
      // Skip database update for local workflows
      if (workflowId.startsWith('local-')) {
        return;
      }
      
      if (isSupabaseConfigured() && supabase) {
        await supabase
          .from('workflow_schedules')
          .update({
            last_run_at: new Date(),
            last_candle_time: candleTime,
            updated_at: new Date()
          })
          .eq('id', workflowId);
      }
    } catch (error) {
      console.error('[WorkflowManager] Error updating workflow run:', error);
    }
  }

  private async updateWorkflowErrors(workflowId: string, errorCount: number) {
    try {
      const workflow = this.activeWorkflows.get(workflowId);
      if (workflow) {
        workflow.consecutive_errors = errorCount;
      }
      
      // Skip database update for local workflows
      if (workflowId.startsWith('local-')) {
        return;
      }
      
      if (isSupabaseConfigured() && supabase) {
        await supabase
          .from('workflow_schedules')
          .update({
            consecutive_errors: errorCount,
            updated_at: new Date()
          })
          .eq('id', workflowId);
      }
    } catch (error) {
      console.error('[WorkflowManager] Error updating workflow errors:', error);
    }
  }

  private async handleWorkflowError(workflow: WorkflowSchedule, error: Error) {
    const newErrorCount = workflow.consecutive_errors + 1;
    await this.updateWorkflowErrors(workflow.id, newErrorCount);

    // Deactivate after 5 consecutive errors
    if (newErrorCount >= 5) {
      console.error(`[WorkflowManager] Deactivating workflow ${workflow.id} after ${newErrorCount} errors`);
      await this.deactivateWorkflow(workflow.id);
    }
  }

  private async recordMonitoringDecision(signalId: string, kline: number[], decision: Partial<MonitoringDecision>) {
    try {
      const fullDecision: MonitoringDecision = {
        id: `${signalId}-${Date.now()}`,
        signal_id: signalId,
        timestamp: new Date(),
        price: parseFloat(kline[4]), // Close price
        decision: decision.decision || 'continue',
        confidence: decision.confidence || 0,
        reasoning: decision.reasoning || '',
        indicators: decision.indicators || {},
        created_at: new Date()
      };

      // Store in local memory
      const existing = this.localMonitoringDecisions.get(signalId) || [];
      existing.push(fullDecision);
      this.localMonitoringDecisions.set(signalId, existing);

      // In local mode, just log the decision
      if (!isSupabaseConfigured() || !supabase) {
        console.log(`[WorkflowManager] Local monitoring decision for ${signalId}:`, {
          decision: decision.decision,
          confidence: decision.confidence,
          reasoning: decision.reasoning
        });
        return;
      }

      await supabase
        .from('monitoring_decisions')
        .insert([fullDecision]);

      console.log(`[WorkflowManager] Recorded monitoring decision for signal ${signalId}: ${decision.decision}`);
    } catch (error) {
      console.error('[WorkflowManager] Error recording monitoring decision:', error);
    }
  }

  async getMonitoringDecisions(signalId: string): Promise<MonitoringDecision[]> {
    // First check local memory
    const localDecisions = this.localMonitoringDecisions.get(signalId) || [];
    
    // If Supabase is configured, also fetch from database
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from('monitoring_decisions')
          .select('*')
          .eq('signal_id', signalId)
          .order('created_at', { ascending: true });
        
        if (error) {
          console.error('[WorkflowManager] Error fetching monitoring decisions:', error);
          return localDecisions;
        }
        
        // Merge local and database decisions, removing duplicates
        const allDecisions = [...localDecisions];
        const localIds = new Set(localDecisions.map(d => d.id));
        
        if (data) {
          data.forEach(dbDecision => {
            if (!localIds.has(dbDecision.id)) {
              allDecisions.push({
                ...dbDecision,
                timestamp: new Date(dbDecision.timestamp),
                created_at: new Date(dbDecision.created_at)
              });
            }
          });
        }
        
        return allDecisions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      } catch (error) {
        console.error('[WorkflowManager] Failed to fetch monitoring decisions:', error);
        return localDecisions;
      }
    }
    
    return localDecisions;
  }

  async shutdown() {
    // Unsubscribe from all kline events
    this.subscriptions.forEach(unsub => unsub());
    this.subscriptions.clear();
    this.activeWorkflows.clear();
    this.initialized = false;
    console.log('[WorkflowManager] Shutdown complete');
  }
}

export const workflowManager = WorkflowManager.getInstance();