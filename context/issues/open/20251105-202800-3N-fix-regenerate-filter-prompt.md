# Fix regenerate-filter-go Prompt - Missing SeriesCode and Indicators

**Type:** bug
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-05 19:45:00

## Context

User created "1m RSI Oversold Scalp" trader but indicators are not showing. Investigation revealed that the trader in the database has `seriesCode: null` and `indicators: []`.

Root cause: The `regenerate-filter-go` prompt in Braintrust does NOT include instructions to generate `seriesCode` and `indicators` fields, even though issue 002 was marked as complete.

## Current State

**Prompt Output:**
```json
{
  "requiredTimeframes": ["1m"],
  "filterCode": "..."
}
```

**Expected Output:**
```json
{
  "requiredTimeframes": ["1m"],
  "filterCode": "...",
  "seriesCode": "...",
  "indicators": [...]
}
```

## Root Cause

The file `regenerate-filter-go-streamlined.md` only defines a 2-field output schema. It was never updated with the series code instructions from issue 002.

## Solution

Update the prompt to include:
1. `seriesCode` field in JSON output
2. `indicators` array in JSON output  
3. Documentation on how to generate series code
4. Examples showing both filterCode and seriesCode

## Linked Items

- Related: `context/issues/open/20251105-125847-002-prompt-engineering-series-code.md` (falsely marked complete)
- Part of: `context/issues/closed/20251105-125847-001-PROJECT-custom-indicator-visualization.md`

## Progress

✅ **FIXED** (2025-11-05 20:56)

**Root Cause Identified:**
The prompt file `regenerate-filter-go-streamlined.md` was missing the Mustache template variables `{{conditions}}` and `{{klineInterval}}` at the end. The `promptLoader.loadPromptWithVariables()` function expects these placeholders to inject the user's actual trading conditions into the prompt.

Without these variables:
- User's trading conditions were never sent to the LLM
- LLM received an incomplete prompt with just instructions
- LLM responded conversationally ("I'm ready...") instead of with JSON

**Fix Applied:**
1. Added section at end of prompt:
   ```markdown
   ## Trading Conditions

   Generate code for the following conditions:

   {{conditions}}

   **Primary timeframe:** {{klineInterval}}
   ```

2. Uploaded to Braintrust as v5.1 (transaction: 1000196091334955886)
3. Committed fix: df62059
4. Cache will clear in 5 minutes (20:56 → 21:01 UTC)

**Testing:**
Need to wait for Braintrust cache to clear, then create a new trader to verify the fix works.

## Spec

1. Update `regenerate-filter-go-streamlined.md` with:
   - New JSON schema (4 fields)
   - SeriesCode section with examples
   - Indicators array documentation
   
2. Re-upload to Braintrust

3. Test by creating a new trader

4. Verify seriesCode and indicators are populated

