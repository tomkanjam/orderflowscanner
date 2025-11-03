# Migrate Signal Tables to shadcn/ui Table Component

**Type:** enhancement
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-02 13:12:47

## Context
Currently using three separate custom HTML table implementations for displaying signals:
- `apps/app/components/SignalTable.tsx` - Legacy signal table with custom `tm-table` classes
- `apps/app/src/components/EnhancedSignalsTable.tsx` - Enhanced table with lifecycle management
- `apps/app/src/components/TraderSignalsTable.tsx` - Trader-specific signals table

This violates our design philosophy: **"shadcn/ui only. MANDATORY: Use shadcn/ui components exclusively for ALL UI elements."**

Custom table implementations create:
- Inconsistent styling across different signal views
- Duplicate CSS and component logic
- Accessibility issues
- Poor mobile responsiveness compared to shadcn standards
- Maintenance overhead with multiple implementations

## Linked Items
- Part of: End-to-end trader workflow implementation initiative
- Related: Mobile-first design philosophy

## Progress
[Track progress here - edit this section, don't append]

## Spec

### Goals
1. Replace all custom table implementations with shadcn/ui Table component
2. Consolidate into a single, reusable `SignalsTable` component
3. Maintain all existing functionality (sorting, filtering, expandable rows, status indicators)
4. Ensure mobile-first design with proper responsive behavior
5. Remove deprecated table components and their CSS

### Implementation Approach

**Phase 1: Install shadcn Table Component**
- Use shadcn MCP server to add Table component
- Review generated component for customization needs
- Ensure theming aligns with current design system (nt-* variables)

**Phase 2: Create Unified SignalsTable Component**
- Location: `apps/app/src/components/SignalsTable.tsx`
- Props interface should support all use cases:
  - Trader-specific filtering
  - Historical signals display
  - Signal lifecycle status (Elite tier)
  - Infinite scroll pagination
  - Expandable row details
  - Sound notifications
  - Cloud signals filtering
- Use shadcn Table, TableHeader, TableBody, TableRow, TableCell components
- Implement responsive design with mobile card view fallback
- Add proper ARIA labels for accessibility

**Phase 3: Feature Parity**
Essential features to preserve:
- Real-time price updates from tickers Map
- New signal animations and sound notifications
- Status filtering tabs (Elite tier only)
- Expandable rows for signal details (analysis, monitoring history)
- Historical scan controls and progress
- Signal deduplication settings
- Infinite scroll with intersection observer
- Action buttons (Analyze, Execute) for Elite tier
- Click handlers for chart selection

**Phase 4: Remove Old Components**
Files to delete:
- `apps/app/components/SignalTable.tsx`
- `apps/app/components/SignalTableRow.tsx`
- `apps/app/src/components/EnhancedSignalsTable.tsx`
- Any related custom CSS for `tm-table`, legacy table classes

**Phase 5: Update Imports**
Update all imports across:
- Page components
- Dashboard views
- Trader detail views
- Any other consumers of the old table components

### Mobile-First Considerations
- 44px+ tap targets for all interactive elements
- Card view for narrow screens (<768px)
- Sticky headers for desktop table view
- Progressive disclosure for signal details
- Swipe gestures for row actions (future enhancement)

### Acceptance Criteria
- [ ] All signal displays use single shadcn Table-based component
- [ ] Mobile view provides card-based layout
- [ ] Desktop view uses responsive table
- [ ] All features from three original tables are preserved
- [ ] No custom table CSS remains
- [ ] Performance matches or exceeds current implementation
- [ ] Accessibility audit passes (keyboard navigation, screen readers)
- [ ] Visual regression tests pass (compare screenshots)
- [ ] Code review confirms shadcn-only compliance
