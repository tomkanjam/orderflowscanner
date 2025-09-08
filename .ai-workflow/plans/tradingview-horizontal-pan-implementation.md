# TradingView-Style Two-Finger Horizontal Panning Implementation Plan

## Executive Summary
This plan outlines the implementation of smooth two-finger horizontal panning for our Chart.js-based trading charts, similar to TradingView's UX. The goal is to enable intuitive horizontal navigation through time-series data using trackpad gestures.

## Current State Analysis

### Existing Implementation
- **Chart Library**: Chart.js v4.5.0 with chartjs-plugin-zoom v2.2.0
- **Current Pan**: Click-and-drag panning (single finger)
- **Current Zoom**: Two-finger vertical scroll (pinch-to-zoom supported)
- **Limitations**: 
  - No horizontal scroll support
  - Two-finger gestures trigger zoom, not pan
  - No native deltaX handling

### Technical Constraints
1. **Browser Limitation**: Trackpads emit `wheel` events, not `touch` events
2. **Plugin Limitation**: chartjs-plugin-zoom interprets all wheel events as zoom
3. **Event Conflict**: Cannot distinguish two-finger scroll intent (zoom vs pan)

## Proposed Solution

### Approach 1: Shift+Scroll for Horizontal Pan (Recommended)
**Implementation**: Detect Shift key + vertical scroll to trigger horizontal pan

```javascript
canvas.addEventListener('wheel', (e) => {
  if (e.shiftKey) {
    e.preventDefault();
    chart.pan({x: -e.deltaY * 2}, undefined, 'none');
  }
}, {passive: false});
```

**Pros**: 
- Simple, reliable implementation
- Industry standard (used by Figma, Adobe, etc.)
- No conflicts with existing zoom

**Cons**: 
- Requires keyboard modifier
- Not as intuitive as pure trackpad gesture

### Approach 2: Native Horizontal Scroll Detection
**Implementation**: Detect deltaX values from trackpad horizontal swipe

```javascript
canvas.addEventListener('wheel', (e) => {
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    e.preventDefault();
    chart.pan({x: -e.deltaX * 2}, undefined, 'none');
  }
}, {passive: false});
```

**Pros**: 
- More intuitive for Mac users
- No keyboard required

**Cons**: 
- Not all trackpads generate deltaX
- May conflict with horizontal scrolling of parent container

### Approach 3: Hybrid Solution (Best UX)
**Implementation**: Support both Shift+scroll AND native horizontal scroll

```javascript
const handleCustomWheel = (e) => {
  const isHorizontalGesture = Math.abs(e.deltaX) > Math.abs(e.deltaY);
  const isShiftScroll = e.shiftKey && e.deltaY !== 0;
  
  if (isHorizontalGesture || isShiftScroll) {
    e.preventDefault();
    
    // Temporarily disable zoom plugin
    chart.options.plugins.zoom.zoom.wheel.enabled = false;
    
    // Calculate pan delta
    const delta = isHorizontalGesture ? e.deltaX : e.deltaY;
    const panSpeed = 2; // Configurable
    
    // Apply pan with smooth animation
    chart.pan({x: -delta * panSpeed}, undefined, 'default');
    
    // Re-enable zoom after gesture
    setTimeout(() => {
      chart.options.plugins.zoom.zoom.wheel.enabled = true;
    }, 100);
  }
};
```

## Implementation Details

### Phase 1: Core Functionality
1. Add wheel event listener to chart canvas
2. Detect horizontal scroll intent (deltaX or Shift+deltaY)
3. Temporarily disable zoom plugin during horizontal pan
4. Apply pan using chart.pan() API
5. Sync with indicator charts

### Phase 2: Polish & Optimization
1. Add smooth animation transitions
2. Implement gesture momentum/inertia
3. Add visual feedback (cursor change)
4. Configure pan speed sensitivity
5. Add user preference settings

### Phase 3: Extended Features
1. Touch device support (mobile/tablet)
2. Gesture customization options
3. Keyboard shortcuts (arrow keys)
4. Pan boundaries and limits
5. Performance optimization for large datasets

## Edge Cases & Handling

### 1. Nested Scrollable Containers
**Issue**: Parent container may intercept scroll events
**Solution**: Use stopPropagation() and proper event capture phase

### 2. Mixed Gesture Intent
**Issue**: User starts vertical scroll, then moves horizontally
**Solution**: Lock gesture direction after initial detection

### 3. Zoom/Pan State Conflicts
**Issue**: Rapid switching between zoom and pan modes
**Solution**: Debounce mode switches with 100ms delay

### 4. Browser Differences
**Issue**: Safari, Chrome, Firefox handle wheel events differently
**Solution**: Normalize delta values across browsers

### 5. Performance with Multiple Charts
**Issue**: Syncing pan across multiple charts may lag
**Solution**: Use requestAnimationFrame() for batched updates

### 6. Accessibility
**Issue**: Keyboard-only users can't use trackpad gestures
**Solution**: Provide alternative keyboard shortcuts (←→ arrows)

## Risks & Mitigations

### Risk 1: Breaking Existing Zoom Functionality
**Severity**: High
**Mitigation**: 
- Feature flag for gradual rollout
- Extensive testing on different devices
- Fallback to original behavior on error

### Risk 2: Poor Performance on Large Datasets
**Severity**: Medium
**Mitigation**:
- Implement virtual scrolling for off-screen data
- Throttle pan events to 60fps
- Use CSS transforms for smooth animation

### Risk 3: User Confusion with New Gestures
**Severity**: Low
**Mitigation**:
- Add onboarding tooltip
- Visual indicators for current mode
- Settings to customize behavior

### Risk 4: Inconsistent Trackpad Behavior
**Severity**: Medium
**Mitigation**:
- Test on Windows Precision Touchpad
- Test on Mac Force Touch Trackpad
- Provide fallback controls

## Questions for PM

### 1. Gesture Priority
**Question**: Should horizontal pan take priority over vertical zoom?
**Recommended Answer**: Yes, make horizontal pan primary for time-series navigation, with vertical scroll for zoom.

### 2. Default Behavior
**Question**: Should this be opt-in or default behavior?
**Recommended Answer**: Default enabled with user preference to disable/customize in settings.

### 3. Mobile Support
**Question**: Do we need touch gesture support for mobile devices?
**Recommended Answer**: Yes, but in Phase 2. Focus on desktop trackpad first.

### 4. Pan Limits
**Question**: Should users be able to pan beyond the data range?
**Recommended Answer**: No, constrain to data bounds with elastic bounce-back effect.

### 5. Animation Style
**Question**: Smooth animated panning or instant response?
**Recommended Answer**: Smooth with configurable speed, default 200ms transition.

### 6. Indicator Chart Sync
**Question**: Should all charts pan together or independently?
**Recommended Answer**: Together by default, with option to unlink for comparison.

## Technical Requirements

### Dependencies
- No new dependencies required
- Uses existing Chart.js and plugin APIs

### Browser Support
- Chrome 90+ (full support)
- Safari 14+ (full support)
- Firefox 88+ (full support)
- Edge 90+ (full support)

### Performance Targets
- 60fps pan animation
- <16ms event handler execution
- <100ms gesture recognition

## Testing Strategy

### Unit Tests
- Wheel event normalization
- Pan calculation logic
- Gesture detection algorithms

### Integration Tests
- Chart.js plugin interaction
- Multi-chart synchronization
- Event conflict resolution

### E2E Tests
- Complete user gesture flows
- Cross-browser compatibility
- Performance benchmarks

### Manual Testing Matrix
| Device | OS | Browser | Trackpad | Status |
|--------|-----|---------|----------|--------|
| MacBook Pro | macOS 14 | Chrome | Force Touch | Pending |
| MacBook Air | macOS 13 | Safari | Multi-Touch | Pending |
| Dell XPS | Windows 11 | Chrome | Precision | Pending |
| ThinkPad | Windows 10 | Firefox | Traditional | Pending |

## Implementation Timeline

### Week 1
- [ ] Implement basic horizontal scroll detection
- [ ] Add Shift+scroll support
- [ ] Test with existing zoom plugin

### Week 2
- [ ] Add smooth animations
- [ ] Implement gesture debouncing
- [ ] Cross-browser testing

### Week 3
- [ ] Performance optimization
- [ ] User preference settings
- [ ] Documentation and examples

## Success Metrics

1. **User Engagement**: 50% increase in horizontal navigation usage
2. **Performance**: Maintain 60fps during pan operations
3. **User Satisfaction**: <5% negative feedback on new gestures
4. **Bug Rate**: <2 critical bugs in first month
5. **Adoption**: 80% of users using new pan gesture within 2 weeks

## Alternative Considerations

### Why Not Use TradingView's Lightweight Charts?
- Already invested in Chart.js ecosystem
- Custom features not available in lightweight-charts
- Migration cost too high

### Why Not Implement Touch Events?
- Trackpads don't emit touch events
- Would only work on touchscreen devices
- Wheel events are the standard for trackpad

### Why Not Use a Different Plugin?
- chartjs-plugin-zoom is most mature
- Other plugins have similar limitations
- Custom implementation gives us full control

## Conclusion

The hybrid approach (Approach 3) offers the best user experience by supporting both Shift+scroll and native horizontal scroll gestures. This matches TradingView's UX while maintaining compatibility with our existing Chart.js implementation.

Key implementation priorities:
1. Start with Shift+scroll (most reliable)
2. Add deltaX detection (better UX)
3. Ensure smooth animation and performance
4. Provide clear user feedback

With proper testing and gradual rollout, this enhancement will significantly improve the chart navigation experience for our trading platform users.