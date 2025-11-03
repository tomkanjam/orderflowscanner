import { supabase } from '../src/config/supabase';

interface ObservabilityEvent {
  type: 'generation' | 'stream-start' | 'stream-complete' | 'error' | 'analysis';
  traceId?: string;
  metadata: {
    model: string;
    klineInterval?: string;
    klineLimit?: number;
    prompt?: string;
    response?: any;
    error?: string;
    usage?: any;
    duration?: number;
    streamProgress?: string[];
    analysisType?: 'market' | 'symbol';
    symbol?: string;
  };
}

class ObservabilityService {
  private batchQueue: ObservabilityEvent[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private isEnabled: boolean = false; // Disabled - all LLM tracing moved to Braintrust
  private traceIdMap: Map<string, string> = new Map();

  constructor() {
    // Frontend user journey tracking disabled
    // All LLM observability now handled by Braintrust (edge functions + Go backend)
    this.isEnabled = false;

    console.log('[Observability] Frontend tracking disabled - LLM tracing handled by Braintrust');
  }

  private async checkAuth(): Promise<boolean> {
    if (!supabase) return false;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      return !!user;
    } catch {
      return false;
    }
  }

  async trackEvent(event: ObservabilityEvent): Promise<string | undefined> {
    // Disabled - all LLM tracing handled by Braintrust in edge functions and Go backend
    return undefined;
  }

  private async flushBatch(): Promise<void> {
    // Disabled - no-op
    return;
  }

  // Helper method to generate trace IDs
  generateTraceId(): string {
    return crypto.randomUUID();
  }

  // Helper methods for specific event types
  async trackGeneration(
    prompt: string,
    model: string,
    klineInterval: string,
    klineLimit: number,
    response: any,
    usage: any,
    duration: number,
    error?: string
  ): Promise<void> {
    await this.trackEvent({
      type: 'generation',
      metadata: {
        prompt,
        model,
        klineInterval,
        klineLimit,
        response,
        usage,
        duration,
        error,
      },
    });
  }

  async trackStreamStart(
    traceId: string,
    prompt: string,
    model: string,
    klineInterval: string
  ): Promise<void> {
    this.traceIdMap.set(traceId, traceId);
    await this.trackEvent({
      type: 'stream-start',
      traceId,
      metadata: {
        prompt,
        model,
        klineInterval,
      },
    });
  }

  async trackStreamComplete(
    traceId: string,
    model: string,
    klineInterval: string,
    response: any,
    usage: any,
    duration: number,
    streamProgress: string[],
    error?: string
  ): Promise<void> {
    await this.trackEvent({
      type: 'stream-complete',
      traceId,
      metadata: {
        model,
        klineInterval,
        response,
        usage,
        duration,
        streamProgress,
        error,
      },
    });
    
    // Clean up trace ID
    this.traceIdMap.delete(traceId);
  }

  async trackAnalysis(
    analysisType: 'market' | 'symbol',
    model: string,
    prompt: string,
    response: any,
    usage: any,
    duration: number,
    symbol?: string,
    error?: string
  ): Promise<void> {
    await this.trackEvent({
      type: 'analysis',
      metadata: {
        analysisType,
        model,
        prompt,
        response,
        usage,
        duration,
        symbol,
        error,
      },
    });
  }

  // Ensure batch is flushed on page unload
  setupUnloadHandler(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.flushBatch();
      });
    }
  }
}

export const observability = new ObservabilityService();