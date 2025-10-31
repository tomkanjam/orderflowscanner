---
name: designer
description: Expert guidance for UI/UX design, Supabase design system, shadcn/ui components, and design consistency in the crypto screener app
---

# Designer Skill

This skill provides comprehensive guidance for implementing, maintaining, and evolving the design system in the AI-powered Binance crypto screener project.

## Project Design Context

**Design Philosophy:**
- Supabase-inspired design language with clean, professional aesthetics
- Dark-mode first (light mode support minimal)
- Technical sophistication with clarity and trust
- Minimalist approach emphasizing readability

**Tech Stack:**
- shadcn/ui components with Tailwind CSS
- Custom component library in `apps/app/src/components/`
- Design tokens using CSS variables (oklch color space)
- Responsive design with mobile-first approach

**Key Components:**
- Signal/Trader cards with expandable states
- Multi-panel chart displays
- Sidebar navigation with nested categories
- Modal dialogs for forms and tier selection
- Real-time status indicators and badges

## Design System Architecture

### 1. Color System (oklch)

**Core Colors:**
```css
--background: oklch(11.48% 0.016 285.82)       /* #0a0a0b - Main background */
--foreground: oklch(97.84% 0.003 285.82)       /* #fafafa - Primary text */

--primary: oklch(65.49% 0.164 141.07)          /* #3ecf8e - Green accent */
--primary-foreground: oklch(11.48% 0.016 285.82)

--secondary: oklch(20.56% 0.022 285.82)        /* #27272a - Subtle elements */
--secondary-foreground: oklch(97.84% 0.003 285.82)

--muted: oklch(20.56% 0.022 285.82)            /* #27272a - Disabled states */
--muted-foreground: oklch(61.74% 0.015 285.82) /* #a1a1aa - Secondary text */

--accent: oklch(20.56% 0.022 285.82)           /* #27272a - Hover states */
--accent-foreground: oklch(97.84% 0.003 285.82)

--destructive: oklch(58.42% 0.19 23.8)         /* #ef4444 - Error/delete */
--destructive-foreground: oklch(97.84% 0.003 285.82)

--border: oklch(27.44% 0.021 285.82)           /* #3f3f46 - Borders */
--input: oklch(27.44% 0.021 285.82)            /* #3f3f46 - Input borders */
--ring: oklch(65.49% 0.164 141.07)             /* #3ecf8e - Focus rings */
```

**Semantic Colors:**
```css
/* Success states */
.badge-success { background: oklch(65.49% 0.164 141.07); }

/* Warning states */
.badge-warning { background: oklch(75.22% 0.167 84.36); }

/* Error states */
.badge-error { background: oklch(58.42% 0.19 23.8); }
```

### 2. Typography

**Font Stack:**
```css
font-family: ui-sans-serif, system-ui, sans-serif;
font-feature-settings: "cv11", "ss01"; /* Optional OpenType features */
```

**Hierarchy:**
```css
.h1 { font-size: 36px; font-weight: 700; line-height: 1.2; }
.h2 { font-size: 30px; font-weight: 600; line-height: 1.3; }
.h3 { font-size: 24px; font-weight: 600; line-height: 1.4; }
.h4 { font-size: 20px; font-weight: 500; line-height: 1.4; }
.h5 { font-size: 16px; font-weight: 500; line-height: 1.5; }
.h6 { font-size: 14px; font-weight: 500; line-height: 1.5; }

.body { font-size: 14px; line-height: 1.5; }
.small { font-size: 12px; line-height: 1.5; }
.xs { font-size: 11px; line-height: 1.5; }
```

### 3. Spacing System

**Consistent spacing scale (Tailwind):**
```
0.5 = 2px   (gaps, small padding)
1   = 4px   (tight spacing)
2   = 8px   (default gap)
3   = 12px  (comfortable padding)
4   = 16px  (section spacing)
6   = 24px  (large section spacing)
8   = 32px  (major section breaks)
12  = 48px  (page sections)
```

### 4. Component Patterns

#### Card Components

**Base Card:**
```tsx
<Card className="border-border bg-card">
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Supporting text</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
  <CardFooter>
    {/* Actions */}
  </CardFooter>
</Card>
```

**Expandable Card Pattern:**
```tsx
<div className={cn(
  "rounded-lg border transition-all duration-200",
  isExpanded ? "bg-accent/50" : "bg-card hover:bg-accent/30"
)}>
  <button
    onClick={onToggleExpand}
    className="w-full p-3 text-left"
  >
    <div className="flex items-start gap-3">
      {/* Icon */}
      <div className="flex-1 min-w-0">
        {/* Title + metadata */}
      </div>
      <ChevronDown className={cn(
        "w-4 h-4 transition-transform",
        isExpanded && "rotate-180"
      )} />
    </div>
  </button>

  {isExpanded && (
    <div className="px-3 pb-3 pt-0 space-y-2 border-t border-border mt-2">
      {/* Expanded content */}
    </div>
  )}
</div>
```

**Stat Card Pattern:**
```tsx
<div className="stat-card">
  <div className="stat-label">Active Signals</div>
  <div className="stat-value">24</div>
  <div className="flex items-center gap-2 mt-2">
    <TrendingUp className="w-4 h-4 text-green-500" />
    <span className="text-xs text-green-500">+12% from last week</span>
  </div>
</div>

/* CSS */
.stat-card {
  @apply bg-card border border-border rounded-lg p-4;
}
.stat-label {
  @apply text-xs text-muted-foreground uppercase tracking-wide;
}
.stat-value {
  @apply text-2xl font-bold mt-1;
}
```

#### Button Variants

```tsx
// Primary action
<Button>Create</Button>

// Secondary action
<Button variant="secondary">Cancel</Button>

// Subtle action
<Button variant="ghost">View Details</Button>

// Outline
<Button variant="outline">Export</Button>

// Destructive
<Button variant="destructive">Delete</Button>

// With icon
<Button>
  <Plus className="w-4 h-4 mr-2" />
  Create Signal
</Button>

// Icon only
<Button size="icon">
  <Settings className="w-4 h-4" />
</Button>
```

#### Badge Variants

```tsx
// Default
<Badge>Active</Badge>

// Success
<Badge className="badge-success">Completed</Badge>

// Warning
<Badge className="badge-warning">Pending</Badge>

// Error
<Badge className="badge-error">Failed</Badge>

// Outline
<Badge variant="outline">Draft</Badge>
```

### 5. Layout Patterns

#### Sidebar Layout

```tsx
<div className="flex h-screen">
  {/* Sidebar */}
  <aside className="w-[360px] border-r border-border bg-background flex flex-col">
    {/* Logo */}
    <div className="px-4 py-4 border-b border-border">
      {/* Logo and app name */}
    </div>

    {/* Actions */}
    <div className="px-4 pt-4 pb-2">
      <Button className="w-full">Create</Button>
    </div>

    {/* Filter */}
    <div className="px-4 pb-2">
      <FilterInput />
    </div>

    {/* Tabs */}
    <div className="px-4">
      <TabBar />
    </div>

    {/* Scrollable content */}
    <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4">
      {/* List items */}
    </div>

    {/* Footer */}
    <div className="px-4 py-4 border-t border-border">
      {/* User menu */}
    </div>
  </aside>

  {/* Main content */}
  <main className="flex-1 overflow-auto">
    {/* Page content */}
  </main>
</div>
```

#### Modal Pattern

```tsx
<Dialog>
  <DialogContent className="sm:max-w-[500px]">
    <DialogHeader>
      <DialogTitle>Create New Signal</DialogTitle>
      <DialogDescription>
        Describe the conditions you want to track
      </DialogDescription>
    </DialogHeader>

    <div className="space-y-4">
      {/* Form fields */}
    </div>

    <DialogFooter>
      <Button variant="outline" onClick={onClose}>
        Cancel
      </Button>
      <Button onClick={onSubmit}>
        Create Signal
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 6. Animation & Transitions

**Standard transitions:**
```css
transition-all duration-200     /* Hover states, expand/collapse */
transition-colors duration-150  /* Color changes only */
transition-transform duration-200  /* Transforms (rotate, scale) */
```

**Animation utilities:**
```tsx
// Fade in
className="animate-in fade-in duration-200"

// Slide in from bottom
className="animate-in slide-in-from-bottom-4 duration-300"

// Loading spinner
className="animate-spin"
```

### 7. Responsive Design

**Breakpoints (Tailwind):**
```
sm: 640px   /* Mobile landscape */
md: 768px   /* Tablet */
lg: 1024px  /* Desktop */
xl: 1280px  /* Large desktop */
2xl: 1536px /* Extra large */
```

**Common patterns:**
```tsx
// Stack on mobile, grid on desktop
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"

// Hide on mobile, show on desktop
className="hidden md:block"

// Full width on mobile, fixed width on desktop
className="w-full md:w-[360px]"

// Responsive padding
className="p-4 md:p-6 lg:p-8"
```

## Component Library

### Custom Components

**Location:** `apps/app/src/components/`

**Key components:**
- `TabBar.tsx` - Tab navigation with counts
- `FilterInput.tsx` - Search input with clear button
- `CategoryHeader.tsx` - Collapsible category headers
- `ExpandableSignalCard.tsx` - Signal/trader card with expand state
- `ChartDisplay.tsx` - Multi-panel chart component
- `TierSelectionModal.tsx` - Subscription tier selection

### shadcn/ui Components

**Installed components:**
- `button`, `card`, `badge`, `avatar`
- `dialog`, `dropdown-menu`, `separator`
- `input`, `textarea`, `select`, `checkbox`
- `tooltip`, `popover`, `tabs`

**Usage pattern:**
```tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
```

### Icon System

**Library:** lucide-react

**Common icons:**
```tsx
import {
  Plus,           // Add/create actions
  Settings,       // Configuration
  User,           // User/profile
  Activity,       // Status/activity
  TrendingUp,     // Positive metric
  TrendingDown,   // Negative metric
  AlertCircle,    // Warning
  CheckCircle2,   // Success
  XCircle,        // Error
  Clock,          // Time/schedule
  BarChart3,      // Analytics
  Zap,            // Feature/premium
  ChevronDown,    // Expand/dropdown
  Search,         // Search
} from "lucide-react";
```

**Icon sizing:**
```tsx
className="w-4 h-4"   // Default (16px)
className="w-5 h-5"   // Medium (20px)
className="w-6 h-6"   // Large (24px)
```

## Design Patterns

### 1. Status Indicators

**Real-time status:**
```tsx
<div className="flex items-center gap-2">
  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
  <span className="text-sm text-muted-foreground">Live</span>
</div>
```

**Badge status:**
```tsx
{status === 'active' && <Badge className="badge-success">Active</Badge>}
{status === 'pending' && <Badge className="badge-warning">Pending</Badge>}
{status === 'error' && <Badge className="badge-error">Error</Badge>}
```

### 2. Loading States

**Skeleton loader:**
```tsx
<div className="animate-pulse space-y-2">
  <div className="h-4 bg-muted rounded w-3/4" />
  <div className="h-4 bg-muted rounded w-1/2" />
</div>
```

**Spinner:**
```tsx
<div className="flex items-center justify-center">
  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
</div>
```

### 3. Empty States

```tsx
<div className="text-center py-12 text-muted-foreground">
  <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
  <p className="text-sm">No signals found</p>
  <p className="text-xs mt-1">Try adjusting your filters</p>
</div>
```

### 4. Tier Access Indicators

```tsx
{userTier === 'Elite' && (
  <Badge className="bg-gradient-to-r from-amber-500 to-orange-500">
    <Zap className="w-3 h-3 mr-1" />
    Elite
  </Badge>
)}

{isProFeature && userTier === 'Free' && (
  <Badge variant="outline" className="text-amber-500">
    Pro Only
  </Badge>
)}
```

### 5. Form Patterns

**Input with label:**
```tsx
<div className="space-y-2">
  <label className="text-sm font-medium">Email Address</label>
  <Input
    type="email"
    placeholder="Enter your email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
  />
  <p className="text-xs text-muted-foreground">
    We'll never share your email
  </p>
</div>
```

**Textarea with counter:**
```tsx
<div className="space-y-2">
  <label className="text-sm font-medium">Description</label>
  <Textarea
    placeholder="Describe your trading strategy..."
    value={description}
    onChange={(e) => setDescription(e.target.value)}
    maxLength={500}
  />
  <p className="text-xs text-muted-foreground text-right">
    {description.length}/500
  </p>
</div>
```

## Style Guide Reference

**Location:** `http://localhost:5173/style-guide`

The style guide page showcases:
- Complete color palette with CSS variable names
- All button variants and sizes
- Badge variants
- Card patterns
- Typography scale
- Stat cards
- Interactive signal library demo

## Best Practices

### 1. Consistency

- Always use design tokens (CSS variables) instead of hardcoded colors
- Use Tailwind utility classes for spacing (no magic numbers)
- Follow established component patterns (don't create one-offs)
- Maintain consistent icon sizes within contexts

### 2. Accessibility

- Ensure sufficient color contrast (WCAG AA minimum)
- Include focus states for all interactive elements
- Use semantic HTML elements
- Provide aria-labels for icon-only buttons
- Test keyboard navigation

### 3. Performance

- Use CSS transitions instead of JavaScript animations
- Lazy load heavy components
- Optimize images and icons
- Minimize CSS-in-JS (prefer Tailwind utilities)

### 4. Mobile-First

- Design for mobile screens first
- Use responsive breakpoints thoughtfully
- Test touch interactions (tap targets ≥44px)
- Avoid hover-only interactions

### 5. Dark Mode

- Design for dark mode first (primary use case)
- Test in both modes if light mode is supported
- Use semantic color variables (not hardcoded)
- Ensure charts/visualizations work in dark mode

## Design Review Checklist

When implementing new features or components:

- [ ] Colors use CSS variables from design system
- [ ] Typography follows established hierarchy
- [ ] Spacing uses Tailwind scale (no arbitrary values)
- [ ] Component follows existing patterns
- [ ] Responsive across all breakpoints
- [ ] Accessible (keyboard, screen readers, contrast)
- [ ] Loading and error states designed
- [ ] Empty states included
- [ ] Icons sized consistently
- [ ] Animations are subtle and performant
- [ ] Matches Supabase design language
- [ ] Works in dark mode
- [ ] Tested on mobile and desktop

## When to Use This Skill

Use this skill when:
- Implementing new UI features or pages
- Creating or modifying components
- Ensuring design consistency across the app
- Troubleshooting visual or layout issues
- Making responsive design decisions
- Choosing appropriate colors, typography, or spacing
- Implementing tier-specific UI elements
- Creating animations or transitions
- Setting up forms or input fields
- Designing empty, loading, or error states

## Related Documentation

- **Style Guide Page:** `/style-guide` (live component showcase)
- **shadcn/ui Docs:** https://ui.shadcn.com/
- **Tailwind CSS:** https://tailwindcss.com/docs
- **Lucide Icons:** https://lucide.dev/
- **Supabase Design:** https://supabase.com/brand-assets/design-system

## Quick Reference

**Access style guide:**
```
http://localhost:5173/style-guide
```

**Add new shadcn component:**
```bash
pnpm dlx shadcn@latest add [component-name]
```

**Color variable reference:**
```css
bg-background       /* Main background */
text-foreground     /* Primary text */
bg-primary          /* Green accent */
text-muted-foreground  /* Secondary text */
border-border       /* All borders */
```

**Common utilities:**
```tsx
className="p-4 rounded-lg border border-border bg-card"
className="text-sm text-muted-foreground"
className="flex items-center gap-2"
className="grid grid-cols-3 gap-4"
```
