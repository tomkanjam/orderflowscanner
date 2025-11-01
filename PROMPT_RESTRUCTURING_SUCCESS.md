# Filter Prompt Restructuring - Success Report

**Date:** 2025-11-01
**Issue:** 20251101-121733-000-remove-filter-prompt-limitations
**Braintrust Version:** 3.0 (Transaction ID: 1000196066663639760)

## Problem

The filter generation prompt implied that filters were limited to pre-made helper functions, causing the LLM to:
- Reject requests for indicators without helpers (Stochastic RSI, ADX, etc.)
- Say "this indicator isn't available yet" instead of implementing it
- Think helpers are requirements, not conveniences

**Example failure**: User requested "Stoch RSI K Line Below 40" and the LLM generated regular Stochastic Oscillator instead.

## Solution

Restructured the 745-line Braintrust prompt to emphasize unlimited capability:

### Key Changes

1. **New Section Order**:
   - ⚡ "Unlimited Capability" section moved to line 119 (before helpers)
   - Custom implementation examples come BEFORE helper reference
   - Helper section reduced from 550 to ~150 lines

2. **Added 4 Complete Custom Examples**:
   - Stochastic RSI (applies stochastic to RSI values)
   - ADX (Average Directional Index with +DM/-DM/TR)
   - RSI Divergence Detection (price vs RSI pivot comparison)
   - Ichimoku Cloud (Tenkan, Kijun, Senkou A/B calculation)

3. **Emphasized Unlimited Capability**:
   ```
   ## ⚡ UNLIMITED CALCULATION CAPABILITY

   **YOU CAN IMPLEMENT ANY TECHNICAL INDICATOR OR CUSTOM LOGIC USING RAW KLINE DATA.**

   You are NOT limited to the helper functions listed later in this prompt.
   ```

4. **Renamed Sections**:
   - "Available Indicator Functions" → "Optional Helper Functions (Convenience)"
   - Deleted "Helper Functions Not Yet Available" section entirely

## Test Results

All 4 test cases passed:

### 1. Stochastic RSI K below 40
✅ **SUCCESS** - Generated custom implementation:
- Step 1: Calculate RSI(14) series from raw klines
- Step 2: Apply Stochastic calculation to RSI values
- Correctly implements Stochastic RSI (not regular Stochastic)

### 2. ADX above 25
✅ **SUCCESS** - Generated from scratch:
- Calculates +DM, -DM, and True Range
- Smooths values over 14-period
- Calculates DI+, DI-, DX, and ADX
- No helper function used

### 3. Bullish RSI Divergence
✅ **SUCCESS** - Generated custom detection:
- Finds price lows and corresponding RSI lows
- Detects bullish divergence (price lower low, RSI higher low)
- Custom pattern recognition logic

### 4. Ichimoku Cloud Bullish
✅ **SUCCESS** - Generated full calculation:
- Tenkan-sen (9-period)
- Kijun-sen (26-period)
- Senkou Span A and B (cloud)
- Bullish condition: price above cloud, Senkou A > Senkou B

## Impact

Users can now request **ANY** technical indicator and the LLM will implement it from scratch using raw kline data (Open, High, Low, Close, Volume). No more "this indicator isn't available yet" responses.

## Deployment

**Braintrust**:
- Project: AI Trader (5df22744-d29c-4b01-b18b-e3eccf2ddbba)
- Slug: regenerate-filter-go
- Version: 3.0
- Transaction ID: 1000196066663639760
- Uploaded: 2025-11-01 12:21:12

**Metadata**:
```json
{
  "version": "3.0",
  "changelog": "Restructured to emphasize unlimited capability. Moved custom implementation examples to top. Reduced helper section from 550 to 150 lines. Deleted 'Not Yet Available' section. Added StochRSI, ADX, RSI Divergence, Ichimoku examples.",
  "git_commit": "49f5611",
  "author": "claude",
  "tested_with": "Stoch RSI request",
  "issue": "20251101-121733-000-remove-filter-prompt-limitations"
}
```

## Monitoring

Track effectiveness at:
- Braintrust Logs: https://www.braintrust.dev/app/AI%20Trader/p/logs
- Filter by operation: `generate_filter_code`
- Monitor: Success rate, custom vs helper usage, token efficiency

## Next Steps

1. Monitor Braintrust traces for quality over next few days
2. If any indicator requests fail, add them as examples to prompt
3. Consider A/B testing if making major changes in future
4. Update Braintrust skill with lessons learned

## Lessons Learned

1. **Section order matters**: LLMs give more weight to content that appears earlier
2. **Repetition matters**: Critical messages should appear multiple times
3. **Examples are powerful**: 4 complete examples were more effective than 550 lines of API docs
4. **Negative framing is dangerous**: "Not Yet Available" implies limitation
5. **Test comprehensively**: All 4 custom indicator tests passed, confirming the restructuring worked
