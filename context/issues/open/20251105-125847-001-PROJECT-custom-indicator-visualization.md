# Custom Indicator Visualization with Go Backend

**Type:** project
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-01-05 12:58:47

## Context

Users can create completely novel custom indicators (Stochastic RSI, ADX, custom momentum formulas, etc.) using natural language. The Go backend calculates these indicators during filter execution but currently discards the intermediate values. This means the frontend cannot display the indicators on charts, breaking a critical part of the trader workflow UX.

Previously, the browser-based system could visualize indicators because calculations happened in JavaScript. After migrating to Go backend, this capability was lost.

## Linked Items

- Part of: End-to-end trader workflow implementation initiative
- Related: `context/docs/custom-indicator-visualization-solution.md`
- Related: `context/docs/indicator-visualization-analysis.md`

## Sub-issues

- [ ] `context/issues/open/20251105-125847-002-prompt-engineering-series-code.md` - Update Braintrust prompt to generate series code
- [ ] `context/issues/open/20251105-125847-003-database-schema-indicator-storage.md` - Add database columns for series code and indicator data
- [ ] `context/issues/open/20251105-125847-004-go-backend-series-execution.md` - Implement series code execution in Go backend
- [ ] `context/issues/open/20251105-125847-005-frontend-indicator-integration.md` - Update frontend to use stored indicator data
- [ ] `context/issues/open/20251105-125847-006-e2e-testing-custom-indicators.md` - End-to-end testing with custom indicators

## Progress

Project created. Starting with prompt engineering.

## Spec

### Architecture Overview

**Solution: Dual Code Generation**

The LLM prompt will generate TWO pieces of Go code:

1. **Filter Code** (existing): Fast boolean evaluation, runs on every candle
   - Returns `bool`
   - Optimized for performance
   - Example: `return stochRSI_K < 20.0`

2. **Series Code** (new): Data collection for visualization, runs only on signal trigger
   - Returns `map[string]interface{}`
   - Generates last 150 data points for each indicator
   - Example: `return map[string]interface{}{"stoch_rsi_k": [{x: ts, y: val}, ...]}`

### JSON Response Format

```json
{
  "filterCode": "string (Go function body)",
  "seriesCode": "string (Go function body)",
  "requiredTimeframes": ["5m", "15m"],
  "indicators": [
    {
      "id": "stoch_rsi_k",
      "name": "Stochastic RSI %K",
      "type": "line",
      "panel": true,
      "params": {"rsi_period": 14}
    }
  ]
}
```

### Data Flow

```
User creates trader with custom indicator
    ↓
LLM generates filterCode + seriesCode + indicators
    ↓
Stored in traders.filter (JSON with both codes)
    ↓
On candle close:
    → Execute filterCode → true/false
    → If true:
        → Execute seriesCode → indicator data
        → Store in signals.indicator_data (JSONB)
    ↓
Frontend fetches signal
    ↓
Chart renders with stored indicator data (no calculation)
```

### Storage Impact

- Typical indicator data: 5-10KB per signal (150 points × 2-3 indicators)
- 10,000 signals = ~100MB
- JSONB with GIN index for efficient queries

### Performance Considerations

1. **Filter execution**: No change, stays fast
2. **Series execution**: Only on signal trigger (low frequency)
3. **Database**: GIN index on JSONB for efficient queries
4. **Frontend**: Zero calculation, instant chart rendering

### Validation Strategy

1. Verify seriesCode output format matches expected structure
2. Check indicator IDs in indicators array match seriesCode keys
3. Validate data point format: `{x: number, y: number, y2?: number}`
4. Ensure timestamps align with kline data

### Error Handling

If seriesCode execution fails:
- Still create signal (degraded mode)
- Log error with details
- Frontend displays chart without indicators (graceful degradation)

## Success Criteria

1. ✅ User creates trader with custom indicator (e.g., "Stochastic RSI K below 20")
2. ✅ LLM generates correct filter + series code
3. ✅ Signal is created with indicator_data populated
4. ✅ Frontend chart displays custom indicator overlays/panels
5. ✅ Works for ANY custom indicator (not just standard ones)
6. ✅ Performance: <50ms overhead for series code execution
7. ✅ Storage: <10KB per signal with 3 indicators

## Implementation Phases

See sub-issues for detailed implementation plans:

1. **Prompt Engineering** (2-3h): Update Braintrust prompt with dual code generation
2. **Database Schema** (30min): Add columns for series_code and indicator_data
3. **Go Backend** (3-4h): Implement series code execution and storage
4. **Frontend** (2h): Display stored indicator data on charts
5. **Testing** (2h): E2E tests with custom indicators

**Total Effort: 9-11 hours**
