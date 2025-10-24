/**
 * Multi-Trader Historical Scanner Worker - STUB
 *
 * This is a stub worker to allow the build to succeed.
 * The actual implementation was lost during migration.
 * TODO: Implement the actual worker logic or remove this feature.
 */

// Worker message types
interface WorkerMessage {
  type: 'start' | 'stop' | 'progress' | 'complete' | 'error';
  data?: any;
}

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { type, data } = e.message;

  switch (type) {
    case 'start':
      // Stub: Just post an error for now
      self.postMessage({
        type: 'error',
        error: new Error('Multi-trader historical scanner is not implemented yet')
      });
      break;

    case 'stop':
      // Stub: Just acknowledge
      self.postMessage({ type: 'complete' });
      break;

    default:
      console.warn('[multiTraderHistoricalScannerWorker] Unknown message type:', type);
  }
};

export {};
