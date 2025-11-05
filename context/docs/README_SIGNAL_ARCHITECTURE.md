# Go Backend Signal Architecture Documentation

This directory contains comprehensive analysis of the Go backend's signal generation and indicator calculation architecture.

## Documents Overview

### 1. INVESTIGATION_SUMMARY.md
**Start here** - Executive summary answering all investigation questions with key findings and recommendations.

**Contains:**
- Q&A format answers to all 6 investigation questions
- Key findings about indicator data loss
- Architecture diagram of signal flow
- Recommendations for chart visualization
- Next steps for implementation

**Best for:** Quick understanding, decision-making, implementation planning

---

### 2. go_backend_signal_architecture.md
**Comprehensive technical reference** - In-depth analysis with code examples and line numbers.

**Contains:**
- Detailed signal generation flow (10 sections)
- Input/output data structures with full code
- Indicator calculation process and return formats
- Analysis engine and Braintrust integration
- Current API endpoints and responses
- Gap analysis for frontend chart visualization
- Code flow diagrams
- Implementation recommendations

**Best for:** Engineering implementation, understanding details, code review

---

### 3. indicator_data_flow.md
**Visual problem statement and solution comparison** - Shows current vs needed data flow.

**Contains:**
- Current data flow diagram
- Problem analysis (indicator data loss)
- Three solution approaches compared:
  - Option 1: Frontend Recalculation
  - Option 2: On-Demand Endpoint
  - Option 3: Store with Signal (Recommended)
- Implementation breakdown for recommended option
- Data structure examples before/after
- Effort estimates
- Reasoning for recommendation

**Best for:** Deciding implementation approach, convincing stakeholders, planning effort

---

## Quick Navigation by Role

### Product Manager / Decision Maker
1. Read: `INVESTIGATION_SUMMARY.md` (5 min)
2. Review: `indicator_data_flow.md` section "Recommendation" (2 min)
3. Approve: Implementation approach

### Backend Engineer
1. Read: `go_backend_signal_architecture.md` sections 1-3 (10 min)
2. Review: Section 8 (Code Flow Diagram) and Section 9 (Key Files)
3. Reference: Specific file paths and line numbers during implementation

### Frontend Engineer
1. Read: `INVESTIGATION_SUMMARY.md` sections Q5-Q6 (3 min)
2. Review: `indicator_data_flow.md` section "Option 3 Implementation" (5 min)
3. Understand: Data structure comparison at bottom of indicator_data_flow.md

### DevOps / Database Admin
1. Read: `indicator_data_flow.md` section "Implementation Breakdown" (3 min)
2. Review: Schema migration requirements
3. Plan: JSONB column addition and testing

---

## Key Findings Summary

### Current State
- Signals generated via event-driven architecture in real-time
- Indicators calculated asynchronously during AI analysis only
- **Indicators NOT persisted to database**
- Signals returned with basic fields only (no indicator data)
- No way to display indicators on charts without recalculation

### Gap for Frontend
- Chart visualization needs indicator values at signal time
- Currently no source for historical indicator data
- Would require either:
  - Recalculation on frontend (slow, 2-3s per signal)
  - Additional API call (adds latency)
  - Store with signal (recommended, instant)

### Recommended Solution
**Store indicators with signals during generation:**
- Add `indicator_data JSONB` column to signals table
- Calculate indicators when signal created (not asynchronously)
- Include in signal response
- Frontend receives everything needed for instant chart display
- Effort: 2-4 hours, minimal database impact

---

## Important Code Locations

### Signal Generation
- **Main file**: `/backend/go-screener/internal/trader/executor.go`
- **Key function**: `executeTrader()` (Lines 188-360)
- **Filter execution**: `processSymbol()` (Lines 689-755)
- **Signal save**: `saveSignals()` (Lines 757-793)

### Indicator Calculation
- **Main file**: `/backend/go-screener/internal/analysis/calculator.go`
- **Function**: `CalculateIndicators()` (Lines 24-67)
- **Implementation**: `/backend/go-screener/pkg/indicators/helpers.go` (Lines 1-456)

### Data Types
- **Signals**: `/backend/go-screener/pkg/types/types.go` (Lines 114-128)
- **Market Data**: `/backend/go-screener/pkg/types/types.go` (Lines 130-145)
- **Klines**: `/backend/go-screener/pkg/types/types.go` (Lines 8-28)

### API Endpoints
- **Server routes**: `/backend/go-screener/internal/server/server.go` (Lines 203-220)
- **Handlers**: `/backend/go-screener/internal/server/trader_handlers.go` (Lines 206-247)

---

## Supported Indicators

The Go backend supports 7 technical indicators with full series calculations:

1. **MA/SMA** (Simple Moving Average)
   - Returns: value, series, period
   
2. **EMA** (Exponential Moving Average)
   - Returns: value, series, period

3. **RSI** (Relative Strength Index)
   - Returns: value, series, period
   - 14-period standard

4. **MACD** (Moving Average Convergence Divergence)
   - Returns: macd, signal, histogram, macdSeries, signalSeries, histogramSeries

5. **Bollinger Bands**
   - Returns: upper, middle, lower, upperSeries, middleSeries, lowerSeries, period, stdDev

6. **VWAP** (Volume Weighted Average Price)
   - Returns: value

7. **Stochastic** (Stochastic Oscillator)
   - Returns: k, d, kPeriod, dPeriod

All indicators return as `map[string]interface{}` for flexibility.

---

## Signal Data Flow

```
WebSocket Data
      ↓
Event Bus (Candle Events)
      ↓
Trader Executor
  ├─ Match traders to intervals
  ├─ Fetch klines & tickers
  ├─ Worker pool processes symbols
  └─ Execute filter code
        ↓
Signal Created (with Metadata field)
        ↓
Signal Saved to DB
  ├─ Basic fields only (currently)
  └─ [Optional: indicator_data JSONB]
        ↓
Queue for Analysis (Async)
  ├─ Recalculate indicators
  ├─ Build prompt
  └─ Call OpenRouter

Response to Frontend
  ├─ Signal with basic fields
  └─ [Optional: Include indicator data]
```

---

## Next Actions (Priority Order)

1. **Decision** (1 hour)
   - Review recommendations
   - Approve implementation approach
   - Assign implementation owner

2. **Design** (1-2 hours)
   - Finalize schema changes
   - Design API response format
   - Plan migration strategy

3. **Implementation** (2-4 hours)
   - Modify executor to calculate indicators
   - Update Signal type with IndicatorData
   - Extend API response
   - Test with sample traders

4. **Testing & Validation** (1-2 hours)
   - Verify indicator accuracy
   - Check database performance
   - Integration test with frontend

5. **Deployment** (1 hour)
   - Run migration
   - Deploy backend
   - Verify with production data

---

## Questions & Support

For questions about specific components:
- **Signal generation**: See `go_backend_signal_architecture.md` Section 1-2
- **Indicators**: See `go_backend_signal_architecture.md` Section 4
- **API endpoints**: See `go_backend_signal_architecture.md` Section 6
- **Implementation approach**: See `indicator_data_flow.md`
- **Code locations**: See this file's "Important Code Locations" section

---

## Document Version

- **Created**: November 5, 2025
- **Investigation Scope**: Complete
- **Status**: Ready for implementation
- **Last Updated**: November 5, 2025
