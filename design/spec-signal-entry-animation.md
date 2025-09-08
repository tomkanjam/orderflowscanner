# Design Specification: Signal Entry Animation

## Design Objectives

1. **Immediate Recognition**: New signals must be instantly identifiable without disrupting the user's workflow
2. **Minimal Distraction**: Animation should enhance, not overwhelm, the trading experience
3. **Clear State Communication**: Users should understand signal age at a glance
4. **Performance**: Zero-impact on table scrolling and interaction performance

## Visual Hierarchy Recommendations

### Before (Current State)
- Entire row pulses with `animate-pulse`
- Background dimmed with `bg-[var(--nt-accent-lime)]/10`
- Affects readability of all row content

### After (Proposed State)
- Only symbol text animates
- Color transition from lime (#C6FF00) to default text (#FAFAF9)
- Other row content remains stable and readable

## Component Specifications

### Animation Properties
```css
@keyframes signal-symbol-fade {
  0% {
    color: var(--nt-accent-lime);
    text-shadow: 0 0 8px var(--nt-accent-lime-glow);
  }
  100% {
    color: var(--nt-text-primary);
    text-shadow: none;
  }
}

.signal-new-symbol {
  animation: signal-symbol-fade 3s ease-out forwards;
}
```

### Timing Specifications
- **Duration**: 3000ms (3 seconds)
- **Easing**: ease-out (fast start, gentle finish)
- **Fill Mode**: forwards (maintains final state)
- **Iteration**: 1 (no repeat)

### Color Values
- **Start Color**: `#C6FF00` (--nt-accent-lime)
- **End Color**: `#FAFAF9` (--nt-text-primary)
- **Optional Glow**: `rgba(198, 255, 0, 0.4)` for first 500ms

## Interaction Patterns

### New Signal Entry
1. Signal appears in table
2. Symbol text immediately shows in lime color
3. Begins 3-second fade to normal
4. Sound notification plays (if enabled)
5. After 3 seconds, symbol appears identical to older signals

### Multiple Signals
- Each signal maintains independent animation timeline
- No synchronization between animations
- Maximum visual impact when signals arrive sequentially

### User Interactions During Animation
- Clicking row works normally during animation
- Hover states apply over animation
- Selected state overrides animation styling

## Implementation Notes for Developers

### React Component Changes

1. **State Management**
   - Continue tracking `newSignalTimestamps` for animation trigger
   - Animation cleanup after 3 seconds (not 2 seconds as currently)

2. **Class Application**
   ```jsx
   // Remove from <tr> element:
   ${newSignalTimestamps.has(signal.createdAt.getTime()) ? 'animate-pulse bg-[var(--nt-accent-lime)]/10' : ''}
   
   // Add to symbol <td> element:
   <td className={`... ${newSignalTimestamps.has(signal.createdAt.getTime()) ? 'signal-new-symbol' : ''}`}>
     {signal.symbol}
   </td>
   ```

3. **Cleanup Timer Update**
   ```javascript
   // Change from 2000ms to 3000ms
   setTimeout(() => {
     setNewSignalTimestamps(prev => {
       const next = new Set(prev);
       newSignals.forEach(signal => next.delete(signal.createdAt.getTime()));
       return next;
     });
   }, 3000); // Updated from 2000
   ```

### CSS Addition
Add animation to either:
- `/apps/app/public/neon-terminal-design-system.css`
- Or inline styles in the component

### Testing Checklist
- [ ] Animation triggers on new signal arrival
- [ ] Animation duration is exactly 3 seconds
- [ ] Multiple signals animate independently
- [ ] Symbol remains readable throughout animation
- [ ] No performance degradation with 50+ signals
- [ ] Animation cleanup prevents memory leaks
- [ ] Works on mobile viewports
- [ ] Historical signals show no animation

## Accessibility Considerations

- Color contrast ratio maintained above 4.5:1 throughout animation
- Animation respects `prefers-reduced-motion` media query
- Screen readers unaffected by visual animation
- Keyboard navigation unchanged

## Performance Metrics

- Target: < 1ms paint time per animation frame
- No layout shifts during animation
- CSS-only animation (no JavaScript in render loop)
- Single repaint trigger (color property only)