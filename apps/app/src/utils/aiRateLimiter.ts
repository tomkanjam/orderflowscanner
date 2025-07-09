// AI Rate Limiter to prevent 429 errors from Gemini API
interface QueuedRequest<T> {
  execute: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
  priority?: number;
}

export class AIRateLimiter {
  private queue: QueuedRequest<any>[] = [];
  private processing = false;
  private lastRequestTime = 0;
  
  // Rate limits per model tier (requests per minute)
  private readonly rateLimits: Record<string, number> = {
    'gemini-2.0-flash-lite-preview-06-17': 1500, // 1500 RPM
    'gemini-2.0-flash-exp': 1000, // 1000 RPM  
    'gemini-1.5-pro': 360, // 360 RPM
    'gemini-1.5-flash': 1500, // 1500 RPM
    'gemini-1.5-flash-8b': 4000 // 4000 RPM
  };
  
  // Default conservative rate limit
  private defaultRateLimit = 300; // 300 RPM
  
  // Minimum delay between requests (ms)
  private getMinDelay(modelName: string): number {
    const rpm = this.rateLimits[modelName] || this.defaultRateLimit;
    return Math.ceil(60000 / rpm); // Convert RPM to ms delay
  }
  
  // Add exponential backoff for retries
  private retryDelays = [1000, 2000, 4000, 8000]; // ms
  
  async execute<T>(
    fn: () => Promise<T>, 
    modelName: string,
    priority: number = 0,
    retryCount: number = 0
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        execute: async () => {
          try {
            const result = await fn();
            return result;
          } catch (error: any) {
            // Handle rate limit errors with retry
            if (error?.status === 429 || error?.message?.includes('429')) {
              if (retryCount < this.retryDelays.length) {
                console.warn(`[AIRateLimiter] Rate limited, retrying in ${this.retryDelays[retryCount]}ms...`);
                await new Promise(r => setTimeout(r, this.retryDelays[retryCount]));
                return this.execute(fn, modelName, priority, retryCount + 1);
              }
            }
            throw error;
          }
        },
        resolve,
        reject,
        priority
      });
      
      // Sort queue by priority (higher priority first)
      this.queue.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      
      if (!this.processing) {
        this.processQueue(modelName);
      }
    });
  }
  
  private async processQueue(modelName: string) {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const request = this.queue.shift();
      if (!request) continue;
      
      // Calculate required delay
      const now = Date.now();
      const minDelay = this.getMinDelay(modelName);
      const timeSinceLastRequest = now - this.lastRequestTime;
      const requiredDelay = Math.max(0, minDelay - timeSinceLastRequest);
      
      if (requiredDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, requiredDelay));
      }
      
      this.lastRequestTime = Date.now();
      
      try {
        const result = await request.execute();
        request.resolve(result);
      } catch (error) {
        request.reject(error);
      }
    }
    
    this.processing = false;
  }
  
  // Get queue status
  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing
    };
  }
  
  // Clear the queue (for emergency stop)
  clearQueue() {
    this.queue.forEach(request => {
      request.reject(new Error('Queue cleared'));
    });
    this.queue = [];
  }
}

// Singleton instance
export const aiRateLimiter = new AIRateLimiter();