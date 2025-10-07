# Design System Best Practices

This document ensures consistency when implementing Supabase-style design system across the application.

## ⚠️ Critical Rules

### 1. **NEVER Use Fixed Border-Radius Classes**

❌ **WRONG:**
```tsx
<div className="rounded-xl"> // Fixed 12px
<div className="rounded-2xl"> // Fixed 16px
<div className="rounded-full"> // Only for avatars!
```

✅ **CORRECT:**
```tsx
<div className="rounded-lg">  // Uses var(--radius)
<div className="rounded-md">  // Uses calc(var(--radius) - 2px)
<div className="rounded-sm">  // Uses calc(var(--radius) - 4px)
```

### 2. **Always Use CSS Variable-Based Classes**

Our Tailwind config maps these classes to CSS variables:

```javascript
// tailwind.config.js
borderRadius: {
  lg: "var(--radius)",           // Main radius
  md: "calc(var(--radius) - 2px)", // Slightly smaller
  sm: "calc(var(--radius) - 4px)", // Even smaller
}
```

This means:
- `rounded-lg` = **variable-based** ✅
- `rounded-xl` = **fixed 12px** ❌

### 3. **Color Classes Must Reference CSS Variables**

❌ **WRONG:**
```tsx
<div className="bg-gray-900">     // Fixed color
<div className="text-slate-400">  // Fixed color
<div className="border-zinc-700"> // Fixed color
```

✅ **CORRECT:**
```tsx
<div className="bg-background">        // Uses var(--background)
<div className="text-muted-foreground"> // Uses var(--muted-foreground)
<div className="border-border">        // Uses var(--border)
```

### 4. **Exception: Avatars**

Avatars should **always** use `rounded-full` (circles):
```tsx
<Avatar className="rounded-full"> // ✅ Correct - avatars are always circular
```

## Component Audit Checklist

When adding new shadcn components, audit them:

### ✅ Fixed Components

- [x] **Button** - Changed `rounded-md` → `rounded-sm`
- [x] **Badge** - Changed `rounded-md` → `rounded-sm`
- [x] **Card** - Changed `rounded-xl` → `rounded-lg`
- [x] **DropdownMenu** - Changed `rounded-md` → `rounded-lg`
- [x] **Avatar** - Kept `rounded-full` (intentional)

### 📋 Future Components to Audit

When adding these components, check for hardcoded classes:

- [ ] **Dialog** - Check for `rounded-*` classes
- [ ] **Input** - Check for `rounded-*` and color classes
- [ ] **Textarea** - Check for `rounded-*` and color classes
- [ ] **Select** - Check for `rounded-*` classes
- [ ] **Table** - Check for color classes
- [ ] **Tabs** - Check for `rounded-*` and color classes
- [ ] **Popover** - Check for `rounded-*` classes
- [ ] **Tooltip** - Check for `rounded-*` classes

## CSS Variable Reference

### All Available Variables

```css
/* Semantic Colors */
--background
--foreground
--card
--card-foreground
--popover
--popover-foreground
--primary
--primary-foreground
--secondary
--secondary-foreground
--muted
--muted-foreground
--accent
--accent-foreground
--destructive
--destructive-foreground
--border
--border-default
--input
--ring

/* Base Color Scale (50-1000) - Grays */
--color-base-50
--color-base-100
--color-base-200
--color-base-300
--color-base-400
--color-base-500
--color-base-600
--color-base-700
--color-base-800
--color-base-900
--color-base-950
--color-base-1000

/* Primary Color Scale (50-1000) - Supabase Green */
--color-primary-50
--color-primary-100
--color-primary-200
--color-primary-300
--color-primary-400
--color-primary-500
--color-primary-600
--color-primary-700
--color-primary-800
--color-primary-900
--color-primary-950
--color-primary-1000

/* Sidebar-specific */
--sidebar-background
--sidebar-foreground
--sidebar-primary
--sidebar-primary-foreground
--sidebar-accent
--sidebar-accent-foreground
--sidebar-border
--sidebar-ring

/* Radius */
--radius
--radius-sm
--radius-md
--radius-lg
--radius-xl

/* Chart colors */
--chart-1
--chart-2
--chart-3
--chart-4
--chart-5
```

### Tailwind Classes Mapped to Variables

```typescript
// Semantic colors:
className="bg-background"           // → var(--background)
className="text-foreground"         // → var(--foreground)
className="bg-card"                 // → var(--card)
className="bg-primary"              // → var(--primary)
className="text-primary-foreground" // → var(--primary-foreground)
className="bg-secondary"            // → var(--secondary)
className="bg-muted"                // → var(--muted)
className="text-muted-foreground"   // → var(--muted-foreground)
className="bg-accent"               // → var(--accent)
className="bg-destructive"          // → var(--destructive)
className="border-border"           // → var(--border)

// Base color scale (50-1000):
className="bg-base-50"              // → var(--color-base-50)
className="bg-base-100"             // → var(--color-base-100)
className="text-base-500"           // → var(--color-base-500)
className="border-base-900"         // → var(--color-base-900)
// ... base-200 through base-1000

// Primary color scale (50-1000):
className="bg-primary-50"           // → var(--color-primary-50)
className="bg-primary-500"          // → var(--color-primary-500)
className="text-primary-600"        // → var(--color-primary-600)
className="border-primary-700"      // → var(--color-primary-700)
// ... primary-100 through primary-1000

// Border radius:
className="rounded-lg"              // → var(--radius)
className="rounded-md"              // → calc(var(--radius) - 2px)
className="rounded-sm"              // → calc(var(--radius) - 4px)
```

## How to Update Radius Globally

To change border-radius site-wide, just update one variable:

```css
/* supabase-design-system.css */
:root {
  --radius: 0rem;      /* Square corners */
  --radius: 0.5rem;    /* Subtle rounded */
  --radius: 0.75rem;   /* Supabase default */
}
```

All components using `rounded-lg`, `rounded-md`, or `rounded-sm` will update automatically!

## Testing Checklist

Before deploying design system changes:

1. [ ] Check style guide page (`/style-guide-supabase`)
2. [ ] Test with `--radius: 0rem` (square)
3. [ ] Test with `--radius: 0.75rem` (rounded)
4. [ ] Test light/dark theme toggle
5. [ ] Verify no hardcoded `rounded-xl` or `rounded-2xl`
6. [ ] Verify no hardcoded color classes like `bg-gray-900`
7. [ ] Test in Chrome, Firefox, Safari

## Common Mistakes

### Mistake #1: Using Fixed Tailwind Classes

```tsx
// ❌ Will NOT respect --radius variable
<Card className="rounded-xl" />

// ✅ Will respect --radius variable
<Card className="rounded-lg" />
```

### Mistake #2: Overriding with Fixed Classes

```tsx
// ❌ The rounded-2xl overrides the variable
<Button className="rounded-2xl">Click</Button>

// ✅ Uses the variable from button component
<Button>Click</Button>

// ✅ Can still override with variable-based class
<Button className="rounded-lg">Click</Button>
```

### Mistake #3: CSS in Public Folder Not Hot-Reloading

If CSS changes don't appear:
1. Hard refresh: `Cmd+Shift+R` (Mac) / `Ctrl+Shift+R` (Windows)
2. Clear browser cache
3. Restart dev server
4. Check Network tab in DevTools to see if old CSS is cached

### Mistake #4: Component-Level Hardcoded Styles

Always check the **component source code** for hardcoded styles:

```tsx
// ❌ Component has hardcoded rounded-xl
function Card({ className }) {
  return <div className={cn("rounded-xl", className)} />
}

// ✅ Component uses variable-based class
function Card({ className }) {
  return <div className={cn("rounded-lg", className)} />
}
```

## Implementation Strategy

When rolling out the design system:

### Phase 1: Shared Components
1. Update all shadcn components first
2. Test on style guide page
3. Commit changes

### Phase 2: Feature Components
1. Update one feature at a time
2. Test in isolation
3. Verify no regressions

### Phase 3: Custom Components
1. Audit custom components (not from shadcn)
2. Replace hardcoded styles
3. Test thoroughly

## Questions?

- **Q: Why not just use `rounded-xl` everywhere?**
  - A: Because `rounded-xl` is a **fixed value** (12px). We need variable-based classes to change the radius globally.

- **Q: What if I need a specific radius just once?**
  - A: Use arbitrary values: `rounded-[8px]` - but this should be rare!

- **Q: Why do avatars stay `rounded-full`?**
  - A: Avatars should always be circular regardless of global radius settings.

- **Q: How do I know which color variable to use?**
  - A: Check `supabase-design-system.css` or use the style guide to see all available colors.

## Reference Files

- **CSS Variables**: `/public/supabase-design-system.css`
- **Tailwind Config**: `tailwind.config.js`
- **Style Guide**: `/src/pages/StyleGuideSupabase.tsx`
- **Components**: `/components/ui/*`
- **Utils**: `/lib/utils.ts` (cn function)
