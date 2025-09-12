# Design Questions for Manual Filter UI

## Primary Questions & Recommendations

### 1. What are the primary user goals for this feature?
**Recommended:** Enable traders to customize their market view by:
- Quickly filter pairs by trading volume (liquidity focus)
- Include/exclude stablecoins for different trading strategies  
- See real-time status of applied filters
- Maintain performance with dynamic symbol counts

### 2. Are there specific brand guidelines to follow?
**Recommended:** Maintain consistency with Neon Terminal design system:
- Dark background with electric accent colors
- Monospace fonts for data display
- Lime (#C6FF00) for primary actions
- Cyan (#00F0FF) for secondary highlights
- Clean borders with subtle glow effects

### 3. What devices/screen sizes must be supported?
**Recommended:** Mobile-first responsive design:
- Mobile: Collapsible filter panel to save space
- Tablet: Compact sidebar filters
- Desktop: Full sidebar with expanded controls
- Maintain usability at all breakpoints

### 4. Are there performance constraints?
**Recommended:** Optimize for fast filtering:
- Debounce volume input (300ms)
- Filter client-side for instant feedback
- Update WebSocket subscriptions efficiently
- Show loading states during resubscription

### 5. What accessibility standards are required?
**Recommended:** WCAG 2.1 AA compliance:
- Keyboard navigation for all controls
- Proper ARIA labels for screen readers
- High contrast ratios (minimum 4.5:1)
- Focus indicators on interactive elements

### 6. Who are the target users and their skill levels?
**Recommended:** Design for both novice and expert traders:
- Clear labels with tooltips for beginners
- Keyboard shortcuts for power users
- Sensible defaults (100k min volume, stables off)
- Visual feedback for filter effects

### 7. Are there any existing design patterns to follow or avoid?
**Recommended:** Build on current patterns:
- Follow StatusBar component structure
- Match existing card/panel styling
- Use consistent spacing variables
- Maintain monospace font for numbers

## Additional Considerations

### Filter Behavior
- Should filters persist across sessions? **Yes, use localStorage**
- Real-time filter application or apply button? **Real-time with debouncing**
- Show count of filtered results? **Yes, prominent display**

### Visual Hierarchy
- Filters below app branding
- Above signal/trader sections
- Clear separation with borders
- Collapsible to save space when not needed

### Future Extensibility
- Design to accommodate additional filters
- Consider filter presets/templates
- Allow for saved filter combinations
- Support for complex filter logic (AND/OR)