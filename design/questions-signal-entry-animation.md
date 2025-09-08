# Design Questions: Signal Entry Animation

## Key Questions for PM

### 1. What are the primary user goals for this feature?
**Recommended:** Draw immediate attention to new signals without being visually overwhelming. The color fade on symbol text provides clear signal differentiation while maintaining table readability.

### 2. Are there specific brand guidelines to follow?
**Recommended:** Maintain consistency with the Neon Terminal design system's lime accent color (#C6FF00) as the primary attention-grabbing color.

### 3. What devices/screen sizes must be supported?
**Recommended:** The text color animation should work seamlessly across all viewport sizes (mobile, tablet, desktop) without performance degradation.

### 4. Are there performance constraints?
**Recommended:** Use CSS transitions for optimal performance instead of JavaScript animations. Limit to color property only to minimize repaints.

### 5. What accessibility standards are required?
**Recommended:** Ensure sufficient color contrast during the entire animation. The lime-to-white transition maintains WCAG 2.1 AA compliance throughout.

### 6. Who are the target users and their skill levels?
**Recommended:** Active traders who need to quickly identify new signals among many rows. The animation duration (3s) balances visibility with minimal distraction.

### 7. Are there any existing design patterns to follow or avoid?
**Recommended:** Follow the existing signal sound notification pattern - subtle but noticeable. Avoid the current full-row dimming which reduces text readability.

### 8. Should the animation repeat or occur only once per signal?
**Recommended:** Animate only once when the signal first appears to avoid visual fatigue during extended monitoring sessions.

### 9. Should historical signals have any visual differentiation?
**Recommended:** No animation for historical signals - maintain the current opacity reduction to clearly distinguish from real-time signals.

### 10. How should multiple simultaneous signals be handled?
**Recommended:** Each new signal animates independently with its own 3-second timeline, allowing users to track multiple entries visually.