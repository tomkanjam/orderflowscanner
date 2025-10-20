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
  private isEnabled: boolean = true;
  private traceIdMap: Map<string, string> = new Map();

  constructor() {
    // Check if observability should be enabled
    this.isEnabled = import.meta.env.VITE_LANGFUSE_ENABLED !== 'false';
    
    // Also check if Supabase is configured
    if (!supabase) {
      console.warn('Supabase not configured. Observability disabled.');
      this.isEnabled = false;
    }
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
    if (!this.isEnabled || !supabase) return;

    // Check if user is authenticated
    const isAuthenticated = await this.checkAuth();
    if (!isAuthenticated) {
      console.debug('User not authenticated. Skipping observability tracking.');
      return;
    }

    // Add timestamp
    const timestampedEvent = {
      ...event,
      timestamp: Date.now(),
    };

    // For critical events, send immediately
    if (event.type === 'error' || event.type === 'generation' || event.type === 'analysis') {
      try {
        const { data, error } = await supabase.functions.invoke('langfuse-proxy', {
          body: timestampedEvent,
        });
        
        if (error) {
          console.error('Failed to track event:', error);
        } else if (data?.traceId) {
          return data.traceId;
        }
      } catch (error) {
        console.error('Failed to track event:', error);
        // Don't throw - observability should never break the app
      }
      return;
    }

    // For other events, batch them
    this.batchQueue.push(timestampedEvent);
    
    if (this.batchQueue.length >= 10) {
      this.flushBatch();
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flushBatch(), 5000);
    }
  }

  private async flushBatch(): Promise<void> {
    if (this.batchQueue.length === 0 || !supabase) return;

    const events = [...this.batchQueue];
    this.batchQueue = [];
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    try {
      const { error } = await supabase.functions.invoke('langfuse-batch', {
        body: { events },
      });
      
      if (error) {
        console.error('Failed to flush batch:', error);
      }
    } catch (error) {
      console.error('Failed to flush batch:', error);
      // Could implement retry logic here
    }
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