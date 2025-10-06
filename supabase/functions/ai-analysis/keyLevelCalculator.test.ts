/**
 * Unit tests for KeyLevelCalculator
 * Run with: deno test supabase/functions/ai-analysis/keyLevelCalculator.test.ts
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { KeyLevelCalculator } from "./keyLevelCalculator.ts";
import { Kline } from "./types.ts";

// Helper to create test klines
function createTestKlines(count: number = 50, basePrice: number = 50000): Kline[] {
  const klines: Kline[] = [];
  let price = basePrice;

  for (let i = 0; i < count; i++) {
    // Simulate price movement with some volatility
    const change = (Math.random() - 0.5) * 1000; // +/- 500
    price += change;

    const open = price;
    const high = price + Math.random() * 500;
    const low = price - Math.random() * 500;
    const close = low + Math.random() * (high - low);
    const volume = Math.random() * 1000;

    klines.push([
      Date.now() + i * 60000, // timestamp
      open.toString(),
      high.toString(),
      low.toString(),
      close.toString(),
      volume.toString(),
      Date.now() + i * 60000 + 60000, // close time
      "0", // quote volume
      0, // trades
      "0", // taker buy base
      "0", // taker buy quote
      "0" // ignore
    ]);
  }

  return klines;
}

// Helper to create klines with specific patterns
function createKlinesWithSwingPoints(): Kline[] {
  // Create klines with clear swing highs and lows
  const prices = [
    50000, 50500, 51000, 50800, 50600, // Swing high at 51000
    50400, 50200, 50000, 49800, 49600, // Downtrend
    49400, 49200, 49000, 49200, 49400, // Swing low at 49000
    49600, 49800, 50000, 50200, 50400, // Uptrend
    50600, 50800, 51000, 51200, 51400  // Current price area
  ];

  return prices.map((price, i) => [
    Date.now() + i * 60000,
    price.toString(),
    (price + 100).toString(), // high
    (price - 100).toString(), // low
    price.toString(),
    "1000",
    Date.now() + i * 60000 + 60000,
    "0",
    0, // numberOfTrades (number)
    "0", "0", "0"
  ] as Kline);
}

Deno.test("KeyLevelCalculator - Calculates key levels with valid data", () => {
  const calculator = new KeyLevelCalculator();
  const klines = createTestKlines(50, 50000);
  const currentPrice = 50000;
  const indicators = { atr_14: 500 }; // Provide ATR

  const result = calculator.calculateKeyLevels(
    currentPrice,
    klines,
    indicators,
    'enter_trade'
  );

  // Verify structure
  assertExists(result.entry);
  assertExists(result.stopLoss);
  assertExists(result.takeProfit);
  assertExists(result.support);
  assertExists(result.resistance);

  // Verify entry equals current price
  assertEquals(result.entry, currentPrice);

  // Verify stop loss is below entry
  assertEquals(result.stopLoss < result.entry, true);

  // Verify take profit targets are above entry
  assertEquals(result.takeProfit.length >= 2, true);
  for (const tp of result.takeProfit) {
    assertEquals(tp > result.entry, true);
  }
});

Deno.test("KeyLevelCalculator - ATR-based stop loss calculation", () => {
  const calculator = new KeyLevelCalculator();
  const klines = createTestKlines(20, 50000);
  const currentPrice = 50000;
  const atr = 500;
  const indicators = { atr_14: atr };

  const result = calculator.calculateKeyLevels(
    currentPrice,
    klines,
    indicators,
    'enter_trade'
  );

  // Stop loss should be 1.5x ATR below entry
  const expectedStopLoss = currentPrice - (atr * 1.5);
  assertEquals(result.stopLoss, expectedStopLoss);
});

Deno.test("KeyLevelCalculator - Take profit levels for enter_trade", () => {
  const calculator = new KeyLevelCalculator();
  const klines = createTestKlines(20, 50000);
  const currentPrice = 50000;
  const atr = 500;
  const indicators = { atr_14: atr };

  const result = calculator.calculateKeyLevels(
    currentPrice,
    klines,
    indicators,
    'enter_trade'
  );

  // Should have 3 take profit levels for enter_trade
  assertEquals(result.takeProfit.length, 3);

  // Verify TP levels are correct multiples
  assertEquals(result.takeProfit[0], currentPrice + (atr * 2.0)); // TP1: 2x ATR
  assertEquals(result.takeProfit[1], currentPrice + (atr * 3.0)); // TP2: 3x ATR
  assertEquals(result.takeProfit[2], currentPrice + (atr * 5.0)); // TP3: 5x ATR
});

Deno.test("KeyLevelCalculator - Take profit levels for bad_setup", () => {
  const calculator = new KeyLevelCalculator();
  const klines = createTestKlines(20, 50000);
  const currentPrice = 50000;
  const atr = 500;
  const indicators = { atr_14: atr };

  const result = calculator.calculateKeyLevels(
    currentPrice,
    klines,
    indicators,
    'bad_setup'
  );

  // Should have only 2 conservative targets for bad_setup
  assertEquals(result.takeProfit.length, 2);

  // Verify conservative targets
  assertEquals(result.takeProfit[0], currentPrice + (atr * 1.0));
  assertEquals(result.takeProfit[1], currentPrice + (atr * 1.5));
});

Deno.test("KeyLevelCalculator - Support levels below current price", () => {
  const calculator = new KeyLevelCalculator();
  const klines = createKlinesWithSwingPoints();
  const currentPrice = 51000;
  const indicators = { atr_14: 500 };

  const result = calculator.calculateKeyLevels(
    currentPrice,
    klines,
    indicators,
    'enter_trade'
  );

  // All support levels should be below current price
  for (const support of result.support) {
    assertEquals(support < currentPrice, true, `Support ${support} should be below ${currentPrice}`);
  }

  // Should find the swing low at 49000
  assertEquals(result.support.some(s => Math.abs(s - 49000) < 200), true, "Should identify swing low near 49000");
});

Deno.test("KeyLevelCalculator - Resistance levels above current price", () => {
  const calculator = new KeyLevelCalculator();
  const klines = createKlinesWithSwingPoints();
  const currentPrice = 49500;
  const indicators = { atr_14: 500 };

  const result = calculator.calculateKeyLevels(
    currentPrice,
    klines,
    indicators,
    'enter_trade'
  );

  // All resistance levels should be above current price
  for (const resistance of result.resistance) {
    assertEquals(resistance > currentPrice, true, `Resistance ${resistance} should be above ${currentPrice}`);
  }

  // Should find swing highs in the upper range
  assertEquals(result.resistance.length >= 1, true, "Should identify at least one resistance level");
});

Deno.test("KeyLevelCalculator - Support/resistance arrays limited to 3 levels", () => {
  const calculator = new KeyLevelCalculator();
  const klines = createKlinesWithSwingPoints();
  const currentPrice = 50000;
  const indicators = { atr_14: 500 };

  const result = calculator.calculateKeyLevels(
    currentPrice,
    klines,
    indicators,
    'enter_trade'
  );

  // Should have at most 3 support and resistance levels
  assertEquals(result.support.length <= 3, true);
  assertEquals(result.resistance.length <= 3, true);
});

Deno.test("KeyLevelCalculator - ATR calculation when not provided", () => {
  const calculator = new KeyLevelCalculator();

  // Create klines with known True Range
  const now = Date.now();
  const klines: Kline[] = [
    [now, "50000", "50500", "49500", "50000", "1000", now + 60000, "0", 0, "0", "0", "0"],
    [now + 60000, "50000", "50600", "49400", "50200", "1000", now + 120000, "0", 0, "0", "0", "0"],
    [now + 120000, "50200", "50700", "49700", "50400", "1000", now + 180000, "0", 0, "0", "0", "0"]
  ];

  const currentPrice = 50400;
  const indicators = {}; // No ATR provided

  const result = calculator.calculateKeyLevels(
    currentPrice,
    klines,
    indicators,
    'enter_trade'
  );

  // Should calculate ATR and use it for stop loss
  assertExists(result.stopLoss);
  assertEquals(result.stopLoss < currentPrice, true);

  // Stop loss should be reasonable (using calculated ATR)
  const expectedMinStopLoss = currentPrice * 0.95; // At least 5% below
  const expectedMaxStopLoss = currentPrice * 0.99; // No more than 1% below
  assertEquals(result.stopLoss > expectedMinStopLoss && result.stopLoss < currentPrice, true);
});

Deno.test("KeyLevelCalculator - Handles insufficient kline data gracefully", () => {
  const calculator = new KeyLevelCalculator();
  const klines = createTestKlines(5, 50000); // Only 5 klines
  const currentPrice = 50000;
  const indicators = { atr_14: 500 };

  const result = calculator.calculateKeyLevels(
    currentPrice,
    klines,
    indicators,
    'enter_trade'
  );

  // Should still return valid structure
  assertExists(result.entry);
  assertExists(result.stopLoss);
  assertExists(result.takeProfit);

  // Support/resistance might be empty with insufficient data
  assertEquals(Array.isArray(result.support), true);
  assertEquals(Array.isArray(result.resistance), true);
});

Deno.test("KeyLevelCalculator - Empty klines array", () => {
  const calculator = new KeyLevelCalculator();
  const klines: Kline[] = [];
  const currentPrice = 50000;
  const indicators = { atr_14: 500 };

  const result = calculator.calculateKeyLevels(
    currentPrice,
    klines,
    indicators,
    'enter_trade'
  );

  // Should return empty support/resistance with empty klines
  assertEquals(result.support.length, 0);
  assertEquals(result.resistance.length, 0);

  // But stop loss and take profit should still be calculated
  assertExists(result.stopLoss);
  assertEquals(result.takeProfit.length, 3);
});

Deno.test("KeyLevelCalculator - Support levels sorted by proximity", () => {
  const calculator = new KeyLevelCalculator();
  const klines = createKlinesWithSwingPoints();
  const currentPrice = 51000;
  const indicators = { atr_14: 500 };

  const result = calculator.calculateKeyLevels(
    currentPrice,
    klines,
    indicators,
    'enter_trade'
  );

  if (result.support.length > 1) {
    // Each support level should be closer to current price than the next
    for (let i = 0; i < result.support.length - 1; i++) {
      const distanceToCurrent = Math.abs(currentPrice - result.support[i]);
      const distanceToNext = Math.abs(currentPrice - result.support[i + 1]);
      assertEquals(distanceToCurrent <= distanceToNext, true, "Support levels should be sorted by proximity");
    }
  }
});

Deno.test("KeyLevelCalculator - Resistance levels sorted by proximity", () => {
  const calculator = new KeyLevelCalculator();
  const klines = createKlinesWithSwingPoints();
  const currentPrice = 49500;
  const indicators = { atr_14: 500 };

  const result = calculator.calculateKeyLevels(
    currentPrice,
    klines,
    indicators,
    'enter_trade'
  );

  if (result.resistance.length > 1) {
    // Each resistance level should be closer to current price than the next
    for (let i = 0; i < result.resistance.length - 1; i++) {
      const distanceToCurrent = Math.abs(currentPrice - result.resistance[i]);
      const distanceToNext = Math.abs(currentPrice - result.resistance[i + 1]);
      assertEquals(distanceToCurrent <= distanceToNext, true, "Resistance levels should be sorted by proximity");
    }
  }
});
