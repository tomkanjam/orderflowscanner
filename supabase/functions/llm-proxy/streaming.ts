/**
 * Server-Sent Events (SSE) Streaming Utilities
 *
 * Provides utilities for streaming progress updates, chunks, and results
 * to the browser using the EventSource API
 */

/**
 * Send an SSE event to the client
 *
 * @param controller - ReadableStreamDefaultController
 * @param event - Event name (e.g., 'progress', 'chunk', 'metadata', 'complete', 'error')
 * @param data - Event data (will be JSON stringified)
 */
export function sendSSE(controller: ReadableStreamDefaultController, event: string, data: any): void {
  const encoder = new TextEncoder();
  const eventLine = `event: ${event}\n`;
  const dataLine = `data: ${JSON.stringify(data)}\n\n`;
  console.log(`[SSE] Sending event: ${event}, data:`, data);
  controller.enqueue(encoder.encode(eventLine));
  controller.enqueue(encoder.encode(dataLine));
}

/**
 * Create a streaming response using SSE
 *
 * @param handler - Async function that performs work and sends SSE events
 * @returns Response object with SSE stream
 */
export function createSSEStream(handler: (controller: ReadableStreamDefaultController) => Promise<void>): Response {
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await handler(controller);
        controller.close();
      } catch (error) {
        // Send error event
        sendSSE(controller, 'error', {
          code: 'STREAM_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

/**
 * Send a progress update event
 *
 * @param controller - ReadableStreamDefaultController
 * @param progress - Progress percentage (0-100)
 * @param message - Progress message
 */
export function sendProgress(controller: ReadableStreamDefaultController, progress: number, message: string): void {
  sendSSE(controller, 'progress', {
    progress: Math.min(100, Math.max(0, progress)),
    message

  });
}

/**
 * Send a content chunk event (for streaming LLM responses)
 *
 * @param controller - ReadableStreamDefaultController
 * @param chunk - Content chunk
 */
export function sendChunk(controller: ReadableStreamDefaultController, chunk: string): void {
  sendSSE(controller, 'chunk', { chunk });
}

/**
 * Send a metadata event (for trader conditions, strategy, etc.)
 *
 * @param controller - ReadableStreamDefaultController
 * @param type - Metadata type (e.g., 'condition', 'strategy', 'name')
 * @param value - Metadata value
 */
export function sendMetadata(controller: ReadableStreamDefaultController, type: string, value: any): void {
  sendSSE(controller, 'metadata', { type, value });
}

/**
 * Send a complete event with final result
 *
 * @param controller - ReadableStreamDefaultController
 * @param data - Final result data
 */
export function sendComplete(controller: ReadableStreamDefaultController, data: any): void {
  sendSSE(controller, 'complete', { data });
}

/**
 * Send an error event
 *
 * @param controller - ReadableStreamDefaultController
 * @param code - Error code
 * @param message - Error message
 */
export function sendError(controller: ReadableStreamDefaultController, code: string, message: string): void {
  sendSSE(controller, 'error', { code, message });
}

/**
 * Helper to stream OpenRouter responses as SSE chunks
 *
 * @param controller - ReadableStreamDefaultController
 * @param streamGenerator - Async generator from OpenRouterClient.chatStream()
 */
export async function streamOpenRouterChunks(
  controller: ReadableStreamDefaultController,
  streamGenerator: AsyncGenerator<string>
): Promise<string> {
  let fullContent = '';

  for await (const chunk of streamGenerator) {
    fullContent += chunk;
    sendChunk(controller, chunk);
  }

  return fullContent;
}
