# Trader Filter Debugging Guide

## Common Issues and Solutions

### 1. `bands.slice is not a function` Error

**Issue**: The Bollinger Bands calculation returns an object with `upper`, `middle`, and `lower` properties, not an array.

**Wrong Code**:
```javascript
const bands = helpers.calculateBollingerBands(klines, 20, 2);
const recentBands = bands.slice(-5); // ❌ Error: bands is not an array
```

**Correct Code**:
```javascript
const bands = helpers.calculateBollingerBands(klines, 20, 2);
// bands is { upper: [...], middle: [...], lower: [...] }
const latestBands = helpers.getLatestBollingerBands(klines, 20, 2);
// latestBands is { upper: number, middle: number, lower: number }

// Or to get recent values:
const recentUpper = bands.upper.slice(-5);
const recentMiddle = bands.middle.slice(-5);
const recentLower = bands.lower.slice(-5);
```

### 2. `tickerVolume` is undefined

**Issue**: The ticker object from Binance WebSocket doesn't have a `tickerVolume` property.

**Wrong Code**:
```javascript
const volume = ticker.tickerVolume; // ❌ undefined
```

**Correct Code**:
```javascript
// Use ticker.v for base asset volume (e.g., BTC volume)
const baseVolume = parseFloat(ticker.v);

// Use ticker.q for quote asset volume (e.g., USDT volume)
const quoteVolume = parseFloat(ticker.q);

// Most commonly you want quote volume for USDT pairs
const volumeUSDT = parseFloat(ticker.q);
```

### 3. Ticker Properties Reference

The Binance ticker object has these properties:
- `s`: Symbol (e.g., "BTCUSDT")
- `c`: Last price
- `P`: Price change percent (24h)
- `p`: Price change absolute (24h)
- `v`: Base asset volume (24h)
- `q`: Quote asset volume (24h)
- `h`: High price (24h)
- `l`: Low price (24h)
- `o`: Open price (24h)

Always use `parseFloat()` when working with numeric values:
```javascript
const price = parseFloat(ticker.c);
const changePercent = parseFloat(ticker.P);
const volume = parseFloat(ticker.q);
```

## Debug Utilities

### 1. Debug Trader Filters Programmatically

```javascript
import { debugTraderFilters } from './src/utils/debugTraderFilters';

// Find all issues in trader filters
const issues = await debugTraderFilters();
console.log(issues);
```

### 2. Fix Filter Code Automatically

```javascript
import { fixFilterCode } from './src/utils/debugTraderFilters';

const fixedCode = fixFilterCode(brokenFilterCode);
```

### 3. Validate Filter Code

```javascript
import { validateFilterCode } from './src/utils/debugTraderFilters';

const result = validateFilterCode(filterCode);
if (!result.valid) {
  console.error('Invalid filter:', result.error);
}
```

## UI Component for Debugging

The `TraderFilterDebugger` component can be added to your app to:
- Automatically detect filter issues
- Show detailed error descriptions
- Provide one-click fixes for common problems

```jsx
import { TraderFilterDebugger } from './src/components/TraderFilterDebugger';

// Add to your app
<TraderFilterDebugger />
```

## Example Fixed Filter

Here's an example of a corrected Downside Break Scalp filter:

```javascript
// Calculate Bollinger Bands
const bands = helpers.getLatestBollingerBands(klines, 20, 2);
if (!bands.upper || !bands.middle || !bands.lower) return false;

// Check if price is breaking below lower band
const currentPrice = parseFloat(ticker.c);
const priceBreakdown = currentPrice < bands.lower * 0.995; // 0.5% below lower band

// Volume confirmation
const currentVolume = parseFloat(ticker.q); // Quote volume in USDT
const avgVolume = helpers.calculateAvgVolume(klines, 20);
const volumeSpike = currentVolume > avgVolume * 1.5;

// RSI oversold check
const rsi = helpers.getLatestRSI(klines, 14);
const isOversold = rsi && rsi < 30;

// Generate signal only if all conditions met
return priceBreakdown && volumeSpike && isOversold;
```

## Testing Filters

Always test your filters with sample data:

```javascript
// Mock ticker data
const mockTicker = {
  s: 'BTCUSDT',
  c: '50000',
  P: '-2.5',
  v: '1000',
  q: '50000000'
};

// Test with real klines
const result = filterFunction(mockTicker, klines, helpers, []);
console.log('Filter result:', result);
```