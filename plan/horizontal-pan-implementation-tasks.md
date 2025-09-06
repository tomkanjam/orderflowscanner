# Horizontal Pan Implementation Plan - Hybrid Approach

## Overview
Implementation of TradingView-style horizontal panning using a hybrid approach that supports both Shift+Scroll and native horizontal trackpad gestures.

**Target File**: `apps/app/components/ChartDisplay.tsx`
**Dependencies**: Chart.js v4.5.0, chartjs-plugin-zoom v2.2.0

## Implementation Tasks

### Phase 1: Foundation (Day 1-2)

#### Task 1.1: Create Horizontal Pan Handler Function
**Description**: Create a reusable function to handle horizontal pan logic
**Location**: Add to ChartDisplay component before chart initialization

```typescript
const handleHorizontalPan = useCallback((
  chart: Chart, 
  deltaX: number, 
  animate: boolean = false
) => {
  if (!chart) return;
  
  const panSpeed = 2; // Configurable
  const mode = animate ? 'default' : 'none';
  
  chart.pan({ x: -deltaX * panSpeed }, undefined, mode);
  syncIndicatorCharts(chart);
}, [syncIndicatorCharts]);
```

**Test Criteria**:
- [ ] Function is created and properly typed
- [ ] Function accepts chart instance, delta, and animation flag
- [ ] Function calls chart.pan() with correct parameters
- [ ] Function syncs indicator charts after pan

**Manual Test**:
1. Add console.log to verify function is called
2. Verify pan amount is calculated correctly
3. Check that indicator charts update

---

#### Task 1.2: Add Wheel Event State Management
**Description**: Add state to track wheel zoom enable/disable status
**Location**: Add to component state section

```typescript
const [wheelZoomEnabled, setWheelZoomEnabled] = useState(true);
const wheelZoomTimeoutRef = useRef<NodeJS.Timeout>();
```

**Test Criteria**:
- [ ] State variables are properly initialized
- [ ] Ref for timeout is created
- [ ] No TypeScript errors

**Manual Test**:
1. Verify initial state is true
2. Check state updates work via React DevTools

---

#### Task 1.3: Create Zoom Toggle Helper
**Description**: Helper function to temporarily disable/enable wheel zoom
**Location**: Add after handleHorizontalPan function

```typescript
const toggleWheelZoom = useCallback((enabled: boolean, chart: Chart) => {
  if (!chart?.options?.plugins?.zoom) return;
  
  // Clear any existing timeout
  if (wheelZoomTimeoutRef.current) {
    clearTimeout(wheelZoomTimeoutRef.current);
  }
  
  // Update zoom plugin config
  chart.options.plugins.zoom.zoom.wheel.enabled = enabled;
  
  // If disabling, set timeout to re-enable
  if (!enabled) {
    wheelZoomTimeoutRef.current = setTimeout(() => {
      chart.options.plugins.zoom.zoom.wheel.enabled = true;
      setWheelZoomEnabled(true);
    }, 100);
  }
  
  setWheelZoomEnabled(enabled);
}, []);
```

**Test Criteria**:
- [ ] Function toggles wheel zoom on/off
- [ ] Timeout is properly managed
- [ ] State updates correctly
- [ ] No memory leaks from timeout

**Manual Test**:
1. Call with enabled=false, verify zoom stops working
2. Wait 100ms, verify zoom re-enables
3. Rapid calls don't cause issues

---

### Phase 2: Core Implementation (Day 2-3)

#### Task 2.1: Implement Basic Shift+Scroll Handler
**Description**: Add wheel event listener for Shift+Scroll horizontal pan
**Location**: Add after double-click handler, before chart initialization

```typescript
// Add custom wheel handler for horizontal panning
priceCanvasRef.current.addEventListener('wheel', (e: WheelEvent) => {
  if (!priceChartInstanceRef.current) return;
  
  // Check for Shift key with vertical scroll
  if (e.shiftKey && e.deltaY !== 0) {
    e.preventDefault();
    
    // Temporarily disable zoom
    toggleWheelZoom(false, priceChartInstanceRef.current);
    
    // Pan horizontally using vertical scroll delta
    handleHorizontalPan(priceChartInstanceRef.current, e.deltaY, false);
  }
}, { passive: false });
```

**Test Criteria**:
- [ ] Event listener is attached to canvas
- [ ] Shift+Scroll triggers horizontal pan
- [ ] Normal scroll still zooms
- [ ] preventDefault() stops page scroll

**Manual Test**:
1. Hold Shift and scroll vertically
2. Verify chart pans horizontally
3. Release Shift, verify zoom works
4. Check no page scroll occurs

---

#### Task 2.2: Add Native Horizontal Scroll Support
**Description**: Detect and handle trackpad horizontal swipe (deltaX)
**Location**: Extend the wheel event handler from Task 2.1

```typescript
priceCanvasRef.current.addEventListener('wheel', (e: WheelEvent) => {
  if (!priceChartInstanceRef.current) return;
  
  const isHorizontalGesture = Math.abs(e.deltaX) > Math.abs(e.deltaY);
  const isShiftScroll = e.shiftKey && e.deltaY !== 0;
  
  if (isHorizontalGesture || isShiftScroll) {
    e.preventDefault();
    
    // Temporarily disable zoom
    toggleWheelZoom(false, priceChartInstanceRef.current);
    
    // Determine delta based on gesture type
    const delta = isHorizontalGesture ? e.deltaX : e.deltaY;
    
    // Pan horizontally
    handleHorizontalPan(priceChartInstanceRef.current, delta, false);
  }
}, { passive: false });
```

**Test Criteria**:
- [ ] Horizontal trackpad swipe triggers pan
- [ ] Shift+Scroll still works
- [ ] Vertical scroll without Shift triggers zoom
- [ ] Delta direction is correct

**Manual Test**:
1. Two-finger horizontal swipe on trackpad
2. Verify chart pans in correct direction
3. Two-finger vertical scroll zooms
4. Test on Mac trackpad and Windows Precision Touchpad

---

#### Task 2.3: Add Cleanup for Event Listeners
**Description**: Properly remove event listeners on component unmount
**Location**: In the useEffect cleanup function

```typescript
return () => {
  // Remove wheel event listener
  if (priceCanvasRef.current) {
    priceCanvasRef.current.removeEventListener('wheel', handleWheelEvent);
  }
  
  // Clear any pending timeouts
  if (wheelZoomTimeoutRef.current) {
    clearTimeout(wheelZoomTimeoutRef.current);
  }
  
  destroyAllCharts();
};
```

**Test Criteria**:
- [ ] Event listener is removed on unmount
- [ ] Timeout is cleared
- [ ] No memory leaks
- [ ] No console errors on unmount

**Manual Test**:
1. Navigate away from chart
2. Check browser DevTools for detached listeners
3. Verify no errors in console

---

### Phase 3: Enhancement (Day 3-4)

#### Task 3.1: Add Pan Speed Configuration
**Description**: Make pan speed configurable via props or settings
**Location**: Add to component props interface and use in handler

```typescript
interface ChartDisplayProps {
  // ... existing props
  horizontalPanSpeed?: number; // Default: 2
}

// In handleHorizontalPan:
const panSpeed = horizontalPanSpeed || 2;
```

**Test Criteria**:
- [ ] Prop is properly typed
- [ ] Default value works
- [ ] Custom value overrides default
- [ ] Speed affects pan distance

**Manual Test**:
1. Test with default speed
2. Pass custom speed prop (0.5, 1, 3)
3. Verify pan distance changes

---

#### Task 3.2: Add Smooth Animation Option
**Description**: Support smooth animated panning for better UX
**Location**: Extend handleHorizontalPan function

```typescript
const handleHorizontalPan = useCallback((
  chart: Chart, 
  deltaX: number, 
  animate: boolean = false,
  duration: number = 200
) => {
  if (!chart) return;
  
  const panSpeed = horizontalPanSpeed || 2;
  const mode = animate ? 'default' : 'none';
  
  // For animated pan, use requestAnimationFrame
  if (animate) {
    const startTime = performance.now();
    const startMin = chart.scales.x.min;
    const targetDelta = -deltaX * panSpeed;
    
    const animateStep = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3); // Ease-out cubic
      
      const currentDelta = targetDelta * easeProgress;
      chart.pan({ x: currentDelta }, undefined, 'none');
      
      if (progress < 1) {
        requestAnimationFrame(animateStep);
      } else {
        syncIndicatorCharts(chart);
      }
    };
    
    requestAnimationFrame(animateStep);
  } else {
    chart.pan({ x: -deltaX * panSpeed }, undefined, mode);
    syncIndicatorCharts(chart);
  }
}, [syncIndicatorCharts, horizontalPanSpeed]);
```

**Test Criteria**:
- [ ] Animation runs smoothly
- [ ] Duration is respected
- [ ] Easing function works
- [ ] Non-animated mode still works

**Manual Test**:
1. Enable animation, verify smooth pan
2. Check 60fps performance
3. Rapid gestures don't stack animations

---

#### Task 3.3: Add Visual Feedback
**Description**: Change cursor and show mode indicator during pan
**Location**: In wheel event handler and component state

```typescript
const [isPanning, setIsPanning] = useState(false);

// In wheel handler:
if (isHorizontalGesture || isShiftScroll) {
  setIsPanning(true);
  // ... pan logic
  setTimeout(() => setIsPanning(false), 100);
}

// In JSX (near zoom controls):
{isPanning && (
  <div className="absolute top-2 left-2 px-2 py-1 bg-[var(--tm-accent)] text-[var(--tm-bg-primary)] rounded text-xs">
    Panning
  </div>
)}

// CSS class for cursor:
style={{ cursor: isPanning ? 'grabbing' : 'default' }}
```

**Test Criteria**:
- [ ] Cursor changes during pan
- [ ] Mode indicator appears
- [ ] Feedback is timely
- [ ] No visual glitches

**Manual Test**:
1. Pan and observe cursor change
2. Check indicator appears/disappears
3. Verify no flickering

---

### Phase 4: Cross-Browser Testing (Day 4-5)

#### Task 4.1: Normalize Delta Values
**Description**: Ensure consistent pan behavior across browsers
**Location**: Add normalization function

```typescript
const normalizeDelta = (deltaX: number, deltaY: number, deltaMode: number) => {
  const multipliers = [1, 40, 800]; // [pixel, line, page]
  const multiplier = multipliers[deltaMode] || multipliers[0];
  
  return {
    x: deltaX * multiplier,
    y: deltaY * multiplier
  };
};

// Use in wheel handler:
const normalized = normalizeDelta(e.deltaX, e.deltaY, e.deltaMode);
```

**Test Criteria**:
- [ ] Delta values are normalized
- [ ] Pan distance consistent across browsers
- [ ] Handles different deltaModes
- [ ] No unexpected behavior

**Manual Test**:
1. Test in Chrome, Firefox, Safari
2. Compare pan distances
3. Test with different mice/trackpads

---

#### Task 4.2: Add Browser-Specific Fixes
**Description**: Handle browser quirks and edge cases
**Location**: In wheel event handler

```typescript
// Detect browser
const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// Apply browser-specific adjustments
let adjustedDelta = delta;
if (isFirefox) {
  adjustedDelta *= 0.8; // Firefox tends to have larger deltas
} else if (isSafari) {
  adjustedDelta *= 1.2; // Safari tends to have smaller deltas
}
```

**Test Criteria**:
- [ ] Browser detection works
- [ ] Adjustments improve consistency
- [ ] No browser-specific bugs
- [ ] Fallback for unknown browsers

**Manual Test**:
1. Test each browser
2. Verify adjustments help
3. Test with browser dev tools emulation

---

### Phase 5: Performance & Polish (Day 5)

#### Task 5.1: Add Throttling for High-Frequency Events
**Description**: Throttle wheel events to maintain 60fps
**Location**: Create throttle wrapper for handler

```typescript
const throttle = (func: Function, delay: number) => {
  let timeoutId: NodeJS.Timeout | null;
  let lastExecTime = 0;
  
  return (...args: any[]) => {
    const currentTime = Date.now();
    
    if (currentTime - lastExecTime > delay) {
      func(...args);
      lastExecTime = currentTime;
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        func(...args);
        lastExecTime = Date.now();
        timeoutId = null;
      }, delay - (currentTime - lastExecTime));
    }
  };
};

const throttledWheelHandler = throttle(handleWheelEvent, 16); // 60fps
```

**Test Criteria**:
- [ ] Events are throttled to 60fps
- [ ] No dropped gestures
- [ ] Smooth performance
- [ ] Memory usage stable

**Manual Test**:
1. Rapid scrolling maintains 60fps
2. Use Performance profiler
3. Check memory doesn't grow

---

#### Task 5.2: Add User Preference Storage
**Description**: Save user's preferred pan settings
**Location**: Use localStorage or context

```typescript
const [userPreferences, setUserPreferences] = useState(() => {
  const saved = localStorage.getItem('chartPanPreferences');
  return saved ? JSON.parse(saved) : {
    panSpeed: 2,
    enableAnimation: false,
    enableHorizontalScroll: true
  };
});

// Save on change
useEffect(() => {
  localStorage.setItem('chartPanPreferences', JSON.stringify(userPreferences));
}, [userPreferences]);
```

**Test Criteria**:
- [ ] Preferences persist
- [ ] Defaults work
- [ ] Updates save immediately
- [ ] Invalid data handled

**Manual Test**:
1. Change settings, refresh page
2. Clear localStorage, verify defaults
3. Test with corrupted data

---

## Testing Checklist

### Unit Tests Required
- [ ] handleHorizontalPan function
- [ ] normalizeDelta function
- [ ] throttle function
- [ ] Browser detection logic

### Integration Tests
- [ ] Wheel event → Pan action
- [ ] Zoom disable/enable cycle
- [ ] Multi-chart synchronization
- [ ] Event cleanup on unmount

### E2E Tests
- [ ] Complete pan gesture flow
- [ ] Shift+Scroll interaction
- [ ] Animation performance
- [ ] Settings persistence

### Manual Testing Matrix

| Test Case | Chrome | Firefox | Safari | Edge |
|-----------|--------|---------|--------|------|
| Shift+Scroll horizontal pan | ⬜ | ⬜ | ⬜ | ⬜ |
| Native horizontal swipe | ⬜ | ⬜ | ⬜ | ⬜ |
| Zoom still works | ⬜ | ⬜ | ⬜ | ⬜ |
| No memory leaks | ⬜ | ⬜ | ⬜ | ⬜ |
| 60fps performance | ⬜ | ⬜ | ⬜ | ⬜ |
| Settings persist | ⬜ | ⬜ | ⬜ | ⬜ |

### Device Testing

| Device | OS | Result |
|--------|-----|--------|
| MacBook Pro M1 | macOS 14 | ⬜ |
| MacBook Air Intel | macOS 13 | ⬜ |
| Windows Laptop | Windows 11 | ⬜ |
| Windows Desktop | Windows 10 | ⬜ |
| Linux (Ubuntu) | 22.04 | ⬜ |

## Success Criteria

1. **Functionality**
   - [ ] Shift+Scroll pans horizontally
   - [ ] Horizontal trackpad swipe pans
   - [ ] Normal vertical scroll still zooms
   - [ ] Reset zoom still works

2. **Performance**
   - [ ] Maintains 60fps during pan
   - [ ] No memory leaks
   - [ ] Smooth animations
   - [ ] Responsive to input

3. **Compatibility**
   - [ ] Works in all major browsers
   - [ ] Works on Mac and Windows
   - [ ] Graceful degradation for older browsers

4. **User Experience**
   - [ ] Intuitive gestures
   - [ ] Visual feedback
   - [ ] Customizable settings
   - [ ] No conflicts with existing features

## Risk Mitigation

### Risk: Breaking existing zoom
**Mitigation**: Feature flag to disable new behavior
```typescript
const ENABLE_HORIZONTAL_PAN = process.env.REACT_APP_ENABLE_HORIZONTAL_PAN !== 'false';
```

### Risk: Performance issues
**Mitigation**: Throttling and requestAnimationFrame

### Risk: Browser incompatibility
**Mitigation**: Feature detection and fallbacks

### Risk: User confusion
**Mitigation**: Clear visual feedback and documentation

## Rollout Strategy

1. **Phase 1**: Internal testing with feature flag
2. **Phase 2**: Beta users (5% rollout)
3. **Phase 3**: Gradual rollout (25%, 50%, 75%)
4. **Phase 4**: Full rollout with kill switch

## Documentation Required

- [ ] User guide for new gestures
- [ ] Developer documentation
- [ ] Troubleshooting guide
- [ ] Release notes

## Estimated Timeline

- **Day 1-2**: Foundation tasks (1.1-1.3)
- **Day 2-3**: Core implementation (2.1-2.3)
- **Day 3-4**: Enhancements (3.1-3.3)
- **Day 4-5**: Testing and fixes (4.1-4.2, 5.1-5.2)
- **Day 5**: Documentation and deployment prep

**Total: 5 development days**

## Next Steps

1. Review and approve implementation plan
2. Set up feature flag infrastructure
3. Begin with Task 1.1
4. Daily progress updates
5. Testing after each phase