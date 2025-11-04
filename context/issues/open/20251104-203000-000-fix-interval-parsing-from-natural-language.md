# Fix Interval Parsing from Natural Language in Trader Generation

**Type:** bug
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-04 20:30:00

## Context
When a user enters a trader description like "1h stoch rsi below 40", the system correctly extracts the interval "1h" in the metadata generation step but then ignores it, defaulting to 5 minutes instead. This causes the filter code to be generated for the wrong timeframe.

## The Problem

### Current Flow:
1. User enters: "1h stoch rsi below 40"
2. `generateTraderMetadata()` correctly extracts `timeframe: "1h"` from the prompt
3. TraderForm uses hardcoded default: `KlineInterval.FIVE_MINUTES` (line 39)
4. `generateTrader()` receives the hardcoded 5m interval from TraderForm
5. `generateFilterCode()` generates code for 5m instead of 1h
6. Result: Trader runs on wrong interval

### Root Cause Locations:

**1. TraderForm.tsx (line 39):**
```typescript
const [filterInterval, setFilterInterval] = useState<KlineInterval>(
  editingTrader?.filter?.interval || KlineInterval.FIVE_MINUTES
);
```
Default is hardcoded to 5 minutes for new traders.

**2. geminiService.ts (line 309-326):**
```typescript
export async function generateTrader(
    userPrompt: string,
    modelName: string = 'gemini-2.5-pro',
    klineInterval: string = '1h',  // <-- Parameter from TraderForm
    onStream?: (update: StreamingUpdate) => void
): Promise<TraderGeneration> {
    // ...
    const metadata = await generateTraderMetadata(userPrompt, modelName, onStream);
    // metadata.timeframe contains the extracted interval but is IGNORED

    const { filterCode, requiredTimeframes, language } = await generateFilterCode(
        metadata.conditions,
        modelName,
        klineInterval  // <-- Uses parameter, ignores metadata.timeframe
    );
```

**3. generateTraderMetadata validates timeframe is required (line 153):**
```typescript
const requiredFields = [
    'suggestedName',
    'category',
    'conditions',
    'strategyInstructions',
    'timeframe',  // <-- Required field that's extracted but never used
    'riskLevel'
];
```

## Solution Approach

1. **Update generateTrader to use extracted timeframe:**
   - Use `metadata.timeframe` instead of the `klineInterval` parameter
   - Convert the timeframe string to KlineInterval enum value
   - Fall back to parameter only if metadata doesn't contain timeframe

2. **Update TraderForm to handle extracted interval:**
   - After metadata generation, update the filterInterval state with the extracted value
   - Display the extracted interval to the user for confirmation

3. **Add timeframe mapping utility:**
   - Create function to map strings like "1h", "5m", "1d" to KlineInterval enum
   - Handle edge cases and invalid intervals

## Testing Requirements
- Test with various natural language inputs containing intervals:
  - "1h stoch rsi below 40" → should use 1h
  - "5 minute momentum strategy" → should use 5m
  - "daily breakout trader" → should use 1d
  - "rsi oversold" (no interval) → should use default
- Verify filter code is generated for the correct interval
- Ensure UI reflects the extracted interval

## Linked Items
- Related: This bug explains why traders aren't working as expected when users specify intervals in natural language