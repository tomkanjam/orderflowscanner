# Fix Indicator Chart Race Condition

## Metadata
- **Status:** 🎯 idea
- **Created:** 2025-01-19T14:35:00Z
- **Updated:** 2025-01-19T14:35:00Z
- **Priority:** High
- **Type:** bug
- **Progress:** [          ] 0%

---

## Idea Review
*Stage: idea | Date: 2025-01-19T14:35:00Z*

### Original Idea
Implement Option C from the debugging report to fix the intermittent indicator loading issue. Create chart structures immediately but ensure no dummy/placeholder data is shown - only real calculated indicators should be displayed when ready.

### Enhanced Concept
Fix the race condition between chart creation and indicator calculation by **always creating the chart infrastructure** but intelligently handling the empty state. Charts will render with proper axes and layout immediately, then smoothly populate with real indicator data once calculations complete - never showing fake or placeholder values.

### Target Users
- **Primary:** Active day traders monitoring multiple signals with complex technical indicators
- **Secondary:** Algorithmic traders relying on precise indicator values for decisions
- **Edge Case:** Users on slower connections/devices where calculation delays are more pronounced

### Domain Context
- In professional trading, **data integrity is paramount** - showing wrong or placeholder values even briefly can lead to catastrophic trading decisions
- Similar platforms (TradingView, ThinkOrSwim) handle this by showing loading states without fake data
- The current intermittent behavior undermines trader confidence in the platform

### Suggestions for Improvement
1. **Loading State Visual:** Add subtle "Calculating indicators..." text in empty chart areas
2. **Progressive Rendering:** Display each indicator as soon as it's calculated rather than waiting for all
3. **Calculation Priority:** Calculate visible chart indicators before off-screen ones
4. **Cache Warming:** Pre-calculate common indicators for recently viewed symbols

### Critical Questions

#### Trading Workflow
1. **What happens if a trader clicks rapidly between symbols during volatile markets?**
   - **Why it matters:** Rapid symbol switching is common when scanning for opportunities
   - **Recommendation:** Implement calculation cancellation for non-visible charts to prevent worker overload

#### User Experience
2. **How do we communicate calculation status without disrupting chart analysis?**
   - **Why it matters:** Traders need to know if they're looking at complete data
   - **Recommendation:** Use subtle progress indicators in chart title bars, not in the chart area itself

#### Technical Requirements
3. **Can the Web Worker handle multiple simultaneous indicator calculations efficiently?**
   - **Why it matters:** With 50+ active traders and rapid clicking, worker queues could back up
   - **Recommendation:** Implement worker pooling or priority queue based on visible charts

#### Data Integrity
4. **How do we ensure partial data never displays (e.g., RSI calculated on incomplete klines)?**
   - **Why it matters:** Incorrect indicator values can trigger false trading signals
   - **Recommendation:** Add data validation before rendering any indicator values

#### Performance Impact
5. **Will creating empty chart structures impact memory usage with many panel indicators?**
   - **Why it matters:** Memory management is already carefully bounded
   - **Recommendation:** Monitor chart instance count and destroy non-visible charts aggressively

### Success Criteria
- [ ] Indicators always appear when calculation completes (100% reliability)
- [ ] No placeholder or dummy data ever shown
- [ ] Chart structure renders immediately (<50ms after click)
- [ ] Clear visual indication of calculation status
- [ ] No memory leaks from empty chart instances

### Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Empty charts confuse users | Medium | Add clear "Calculating..." status |
| Memory increase from empty charts | Low | Aggressive cleanup of non-visible charts |
| Worker overload from rapid clicking | High | Implement calculation cancellation |
| Partial indicator data display | Critical | Validate complete data before render |

### Implementation Approach

#### Core Changes Required:
1. **Remove early return** when `calculatedIndicators` is empty (ChartDisplay.tsx lines 595-597)
2. **Create chart structure** with empty datasets initially
3. **Add loading state** to chart config when data pending
4. **Update chart** when calculations complete (existing update effect)

#### Code Structure:
```javascript
// Always create panel chart, even without data
panelIndicators.forEach((indicator, idx) => {
    const dataPoints = calculatedIndicators.get(indicator.id) || [];

    // Create chart with empty or populated datasets
    const datasets = createDatasets(dataPoints); // Returns empty array if no data

    // Add loading indicator to title if empty
    const title = dataPoints.length === 0
        ? `${indicator.name} (calculating...)`
        : indicator.name;

    // Create chart regardless of data state
    createPanelChart(canvasRef, datasets, title, indicator);
});
```

### Recommended Next Steps
1. Answer critical questions above
2. Verify Web Worker can handle the load pattern
3. Design the loading state UX (subtle, non-intrusive)
4. Implement with careful testing of rapid switching
5. Add performance monitoring for chart creation/destruction

### Priority Assessment
**Urgency:** High (affects core user experience)
**Impact:** High (every chart interaction affected)
**Effort:** Small (localized changes to ChartDisplay.tsx)
**Recommendation:** Proceed immediately with careful testing

---
*[End of idea review. Next: /spec issues/2025-09-19-indicator-chart-race-condition-fix.md]*