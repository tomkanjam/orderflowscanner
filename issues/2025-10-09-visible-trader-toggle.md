# Add Visible Trader Toggle Controls

## Metadata
- **Status:** 💡 idea
- **Created:** 2025-10-09T09:00:00Z
- **Type:** feature (UX enhancement)

---

## Idea Review
*Stage: idea | Date: 2025-10-09T09:00:00Z*

### Original Idea
there is no way to toggle traders on/off right now. We need to add this

### Current State
Toggle functionality **already exists** but is hidden in a dropdown menu (... → Enable/Disable). Users must:
1. Click the "..." menu button on a signal card
2. Find the "Enable" or "Disable" option in the dropdown
3. Click it to toggle

This makes toggling traders a 2-click operation that's not immediately discoverable.

### Refined Concept
Expose trader enable/disable as a **primary, visible control** directly on signal cards, making it a single-click operation with clear visual feedback. This transforms signal management from "hidden admin action" to "core user workflow" - critical for active traders who need to quickly enable/disable multiple signals based on market conditions.

### Domain Context
In crypto trading, market conditions change rapidly. Traders need to activate/deactivate signals quickly based on:
- Volatility regime changes (quiet → volatile markets require different signals)
- Time of day (some strategies only work during US/Asia sessions)
- News events (disable momentum signals during major announcements)
- Risk management (quickly disable all signals when reducing exposure)

Making toggle a 2-click hidden operation significantly slows down these critical workflows.

### Critical Questions

1. **Primary Control Location**: Where should the visible toggle appear?
   - On the collapsed card (always visible)?
   - Only when expanded?
   - Both?

2. **Visual Design**: What control should we use?
   - Toggle switch (clear on/off states)?
   - Power button icon (click to toggle)?
   - Checkbox?
   - Something else?

3. **Color/State Indication**: How should enabled vs disabled states be visually distinct?
   - Should card appearance change when disabled (grayed out, reduced opacity)?
   - Should the toggle itself be color-coded (green=on, gray=off)?
   - Should we keep the existing name color change behavior (text-primary when enabled)?

4. **Bulk Operations**: Do users need to toggle multiple traders at once?
   - "Enable all" / "Disable all" for a category?
   - Multi-select to bulk toggle?
   - Or is individual toggling sufficient?

5. **Interaction with Dropdown**: Should we keep the dropdown toggle option or replace it?
   - Keep both (redundant but flexible)?
   - Remove from dropdown (cleaner, single control)?

6. **Cloud Execution Considerations**: For Elite users with cloud execution:
   - Should trader toggle affect cloud execution automatically?
   - Or is trader enable/disable separate from cloud enable/disable?
   - Current behavior: separate controls (trader toggle + cloud toggle)

7. **Mobile/Touch**: How should this work on mobile where space is limited?
   - Same visible toggle?
   - Different mobile-optimized control?

8. **Permission Levels**: Who can toggle what?
   - Built-in signals: All authenticated users (stored in localStorage)
   - Custom signals: Owner only? Or anyone with access?
   - Admin behavior: Same as regular users for built-in?

### Quick Suggestions

**Recommendation**: Power button icon on collapsed card (always visible)
- **Why**: Universally understood "on/off" metaphor
- **Visual**: Green when enabled, gray when disabled
- **Location**: Top-right of card, next to the "..." menu
- **Behavior**: Single click toggles, shows subtle animation/feedback
- **Keep dropdown option**: Yes, for redundancy and discoverability

This gives users the "quick toggle" they need while maintaining the dropdown for users who expect it there.

**Alternative**: Toggle switch on expanded card only
- **Pros**: Clearer binary state, industry-standard control
- **Cons**: Requires expand first (2-click operation still)
- **Use case**: Better if we add bulk operations in the future

---

*Next: Answer questions above, then run /design-issue issues/2025-10-09-visible-trader-toggle.md*
