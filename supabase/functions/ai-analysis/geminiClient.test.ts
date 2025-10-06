/**
 * Unit tests for GeminiClient
 * Run with: deno test supabase/functions/ai-analysis/geminiClient.test.ts
 */

import { assertEquals, assertRejects } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { GeminiClient } from "./geminiClient.ts";

// Mock fetch for testing
const originalFetch = globalThis.fetch;

function mockFetch(response: any, status: number = 200, headers: Record<string, string> = {}) {
  globalThis.fetch = async () => {
    return new Response(JSON.stringify(response), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    });
  };
}

function mockFetchError(error: Error) {
  globalThis.fetch = async () => {
    throw error;
  };
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

// Helper to create valid Gemini response
function createValidGeminiResponse(analysis: any = {
  decision: 'enter_trade',
  confidence: 85,
  reasoning: 'Strong uptrend with RSI support',
  tradePlan: {
    setup: 'Bullish continuation pattern',
    execution: 'Enter on breakout',
    invalidation: 'Close below support',
    riskReward: '3:1'
  },
  technicalContext: {
    trend: 'Bullish',
    momentum: 'Increasing'
  }
}) {
  return {
    candidates: [{
      content: {
        parts: [{ text: JSON.stringify(analysis) }]
      }
    }],
    usageMetadata: {
      totalTokenCount: 150
    }
  };
}

Deno.test("GeminiClient - Success case with valid response", async () => {
  const client = new GeminiClient("test-api-key");
  const validResponse = createValidGeminiResponse();

  mockFetch(validResponse);

  try {
    const result = await client.generateStructuredAnalysis("test prompt");

    assertEquals(result.analysis.decision, 'enter_trade');
    assertEquals(result.analysis.confidence, 85);
    assertEquals(result.tokensUsed, 150);
    assertEquals(typeof result.rawResponse, 'string');
  } finally {
    restoreFetch();
  }
});

Deno.test("GeminiClient - Rate limit error (429) triggers retry", async () => {
  const client = new GeminiClient("test-api-key");
  let callCount = 0;

  // Mock fetch to return 429 first, then success
  globalThis.fetch = async () => {
    callCount++;
    if (callCount === 1) {
      return new Response('Rate limited', {
        status: 429,
        headers: { 'retry-after': '1' }
      });
    }
    return new Response(JSON.stringify(createValidGeminiResponse()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const result = await client.generateStructuredAnalysis("test prompt");

    assertEquals(callCount, 2); // Should retry after 429
    assertEquals(result.analysis.decision, 'enter_trade');
  } finally {
    restoreFetch();
  }
});

Deno.test("GeminiClient - Server error (500) retries 3 times", async () => {
  const client = new GeminiClient("test-api-key");
  let callCount = 0;

  mockFetch({ error: 'Internal server error' }, 500);

  // Track fetch calls
  const trackedFetch = globalThis.fetch;
  globalThis.fetch = async (...args: any[]) => {
    callCount++;
    return trackedFetch(...args);
  };

  try {
    await assertRejects(
      () => client.generateStructuredAnalysis("test prompt", 3),
      Error,
      "Gemini API failed after 3 attempts"
    );

    assertEquals(callCount, 3); // Should retry exactly 3 times
  } finally {
    restoreFetch();
  }
});

Deno.test("GeminiClient - Timeout throws error", async () => {
  const client = new GeminiClient("test-api-key");

  // Mock fetch that never resolves (simulates timeout)
  globalThis.fetch = () => new Promise(() => {});

  try {
    await assertRejects(
      () => client.generateStructuredAnalysis("test prompt", 1),
      Error,
      "Gemini API failed after 1 attempts"
    );
  } finally {
    restoreFetch();
  }
});

Deno.test("GeminiClient - Malformed JSON throws error", async () => {
  const client = new GeminiClient("test-api-key");

  const malformedResponse = {
    candidates: [{
      content: {
        parts: [{ text: 'This is not valid JSON {{{' }]
      }
    }],
    usageMetadata: { totalTokenCount: 50 }
  };

  mockFetch(malformedResponse);

  try {
    await assertRejects(
      () => client.generateStructuredAnalysis("test prompt"),
      Error,
      "Failed to parse Gemini JSON response"
    );
  } finally {
    restoreFetch();
  }
});

Deno.test("GeminiClient - Missing required fields throws error", async () => {
  const client = new GeminiClient("test-api-key");

  const incompleteAnalysis = {
    decision: 'enter_trade',
    confidence: 85
    // Missing: reasoning, tradePlan, technicalContext
  };

  const response = createValidGeminiResponse(incompleteAnalysis);
  mockFetch(response);

  try {
    await assertRejects(
      () => client.generateStructuredAnalysis("test prompt"),
      Error,
      "missing required fields"
    );
  } finally {
    restoreFetch();
  }
});

Deno.test("GeminiClient - Invalid decision throws error", async () => {
  const client = new GeminiClient("test-api-key");

  const invalidAnalysis = {
    decision: 'invalid_decision', // Should be enter_trade, bad_setup, or wait
    confidence: 85,
    reasoning: 'Test',
    tradePlan: {
      setup: 'Test',
      execution: 'Test',
      invalidation: 'Test',
      riskReward: '1:1'
    },
    technicalContext: {}
  };

  const response = createValidGeminiResponse(invalidAnalysis);
  mockFetch(response);

  try {
    await assertRejects(
      () => client.generateStructuredAnalysis("test prompt"),
      Error,
      "Invalid decision"
    );
  } finally {
    restoreFetch();
  }
});

Deno.test("GeminiClient - Invalid confidence range throws error", async () => {
  const client = new GeminiClient("test-api-key");

  const invalidAnalysis = {
    decision: 'enter_trade',
    confidence: 150, // Should be 0-100
    reasoning: 'Test',
    tradePlan: {
      setup: 'Test',
      execution: 'Test',
      invalidation: 'Test',
      riskReward: '1:1'
    },
    technicalContext: {}
  };

  const response = createValidGeminiResponse(invalidAnalysis);
  mockFetch(response);

  try {
    await assertRejects(
      () => client.generateStructuredAnalysis("test prompt"),
      Error,
      "Invalid confidence"
    );
  } finally {
    restoreFetch();
  }
});

Deno.test("GeminiClient - Empty candidates array throws error", async () => {
  const client = new GeminiClient("test-api-key");

  const emptyResponse = {
    candidates: [],
    usageMetadata: { totalTokenCount: 0 }
  };

  mockFetch(emptyResponse);

  try {
    await assertRejects(
      () => client.generateStructuredAnalysis("test prompt"),
      Error,
      "returned no candidates"
    );
  } finally {
    restoreFetch();
  }
});

Deno.test("GeminiClient - Exponential backoff timing", async () => {
  const client = new GeminiClient("test-api-key");
  let callCount = 0;
  const callTimes: number[] = [];

  mockFetch({ error: 'Server error' }, 500);

  const trackedFetch = globalThis.fetch;
  globalThis.fetch = async (...args: any[]) => {
    callCount++;
    callTimes.push(Date.now());
    return trackedFetch(...args);
  };

  try {
    await assertRejects(
      () => client.generateStructuredAnalysis("test prompt", 3)
    );

    // Verify exponential backoff (approximate timing)
    // First call: immediate
    // Second call: ~2s after first
    // Third call: ~4s after second
    if (callTimes.length >= 2) {
      const firstDelay = callTimes[1] - callTimes[0];
      // Should be approximately 2000ms (allow 1500-2500ms for test variance)
      assertEquals(firstDelay > 1500 && firstDelay < 2500, true, "First retry delay should be ~2s");
    }

    if (callTimes.length >= 3) {
      const secondDelay = callTimes[2] - callTimes[1];
      // Should be approximately 4000ms (allow 3500-4500ms for test variance)
      assertEquals(secondDelay > 3500 && secondDelay < 4500, true, "Second retry delay should be ~4s");
    }
  } finally {
    restoreFetch();
  }
});
