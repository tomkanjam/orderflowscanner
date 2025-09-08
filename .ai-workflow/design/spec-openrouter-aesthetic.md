# OpenRouter Aesthetic Design Specification

## Executive Summary
This specification defines a clean, professional, enterprise-grade design system inspired by OpenRouter's aesthetic. The design emphasizes clarity, trust, and technical sophistication through minimalist principles, subtle depth, and exceptional typography.

## Design Objectives

### Primary Goals
1. **Professional Credibility** - Convey enterprise reliability through refined aesthetics
2. **Information Clarity** - Complex data presented simply and scannable
3. **Subtle Sophistication** - Technical depth without visual complexity
4. **Trust Building** - Clean, stable appearance that inspires confidence
5. **Scalable System** - Components that work across all data densities

### Design Principles
- **Minimalism First** - Every element must justify its presence
- **Subtle Depth** - Use shadows and spacing, not borders
- **Breathing Room** - Generous whitespace for visual comfort
- **Quiet Confidence** - Let the data speak, design supports
- **Progressive Disclosure** - Show essential, reveal details on demand

## Visual Design System

### Color Palette

```css
:root {
  /* Backgrounds - Light Mode */
  --bg-primary: #FFFFFF;
  --bg-secondary: #FAFBFC;
  --bg-tertiary: #F6F8FA;
  --bg-elevated: #FFFFFF;
  
  /* Text Hierarchy */
  --text-primary: #0D0D0E;
  --text-secondary: #57606A;
  --text-tertiary: #8B949E;
  --text-quaternary: #ACB5BD;
  
  /* Brand Accent */
  --accent-primary: #6366F1;      /* Indigo-500 */
  --accent-primary-hover: #5558E3;
  --accent-primary-light: #E0E2FF;
  --accent-primary-dark: #4C1D95;
  
  /* Semantic Colors */
  --semantic-success: #16A34A;
  --semantic-success-light: #DCFCE7;
  --semantic-error: #DC2626;
  --semantic-error-light: #FEE2E2;
  --semantic-warning: #F59E0B;
  --semantic-warning-light: #FEF3C7;
  --semantic-info: #2563EB;
  --semantic-info-light: #DBEAFE;
  
  /* Borders & Dividers */
  --border-default: #E2E8F0;
  --border-light: #F1F5F9;
  --border-dark: #CBD5E1;
  
  /* Shadows - Subtle depth system */
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 4px 8px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 8px 16px rgba(0, 0, 0, 0.10);
  --shadow-xl: 0 16px 32px rgba(0, 0, 0, 0.12);
  --shadow-card: 0 0 0 1px rgba(0, 0, 0, 0.05), 
                 0 2px 4px rgba(0, 0, 0, 0.04);
  --shadow-elevated: 0 0 0 1px rgba(0, 0, 0, 0.05),
                     0 4px 8px rgba(0, 0, 0, 0.06);
}
```

### Typography

```css
/* Font Stack */
--font-sans: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', 
             'Roboto', 'Oxygen', 'Ubuntu', sans-serif;
--font-mono: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;

/* Type Scale */
--text-xs: 0.75rem;     /* 12px */
--text-sm: 0.875rem;    /* 14px */
--text-base: 1rem;      /* 16px */
--text-lg: 1.125rem;    /* 18px */
--text-xl: 1.25rem;     /* 20px */
--text-2xl: 1.5rem;     /* 24px */
--text-3xl: 1.875rem;   /* 30px */
--text-4xl: 2.25rem;    /* 36px */
--text-5xl: 3rem;       /* 48px */

/* Font Weights */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;

/* Line Heights */
--leading-tight: 1.2;
--leading-normal: 1.5;
--leading-relaxed: 1.75;

/* Letter Spacing */
--tracking-tight: -0.025em;
--tracking-normal: 0;
--tracking-wide: 0.025em;
```

### Spacing System

```css
/* 8px Grid System */
--space-0: 0;
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-5: 1.25rem;   /* 20px */
--space-6: 1.5rem;    /* 24px */
--space-7: 1.75rem;   /* 28px */
--space-8: 2rem;      /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
--space-16: 4rem;     /* 64px */
--space-20: 5rem;     /* 80px */
--space-24: 6rem;     /* 96px */
```

### Border Radius

```css
--radius-none: 0;
--radius-sm: 0.25rem;   /* 4px */
--radius-md: 0.375rem;  /* 6px */
--radius-lg: 0.5rem;    /* 8px */
--radius-xl: 0.75rem;   /* 12px */
--radius-2xl: 1rem;     /* 16px */
--radius-full: 9999px;
```

## Component Specifications

### Card Component

```css
.card {
  background: var(--bg-elevated);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  box-shadow: var(--shadow-card);
  transition: box-shadow 200ms ease-out;
}

.card:hover {
  box-shadow: var(--shadow-elevated);
}

.card-compact {
  padding: var(--space-4);
}

.card-header {
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--border-light);
}

.card-title {
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  letter-spacing: var(--tracking-tight);
}

.card-description {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin-top: var(--space-1);
}
```

### Button Component

```css
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  font-weight: var(--font-medium);
  transition: all 150ms ease-out;
  border: none;
  cursor: pointer;
  white-space: nowrap;
}

/* Sizes */
.button-sm {
  height: 32px;
  padding: 0 var(--space-3);
  font-size: var(--text-sm);
}

.button-md {
  height: 40px;
  padding: 0 var(--space-4);
  font-size: var(--text-base);
}

.button-lg {
  height: 48px;
  padding: 0 var(--space-6);
  font-size: var(--text-lg);
}

/* Variants */
.button-primary {
  background: var(--accent-primary);
  color: white;
  box-shadow: var(--shadow-sm);
}

.button-primary:hover {
  background: var(--accent-primary-hover);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.button-secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
}

.button-secondary:hover {
  background: var(--bg-secondary);
  border-color: var(--border-dark);
}

.button-ghost {
  background: transparent;
  color: var(--text-secondary);
}

.button-ghost:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}
```

### Data Display Components

```css
/* Metric Card */
.metric-card {
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  box-shadow: var(--shadow-card);
}

.metric-value {
  font-size: var(--text-3xl);
  font-weight: var(--font-bold);
  color: var(--text-primary);
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
}

.metric-label {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  margin-top: var(--space-2);
}

.metric-change {
  display: inline-flex;
  align-items: center;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  margin-top: var(--space-3);
}

.metric-change-positive {
  color: var(--semantic-success);
}

.metric-change-negative {
  color: var(--semantic-error);
}

/* Data Table */
.table {
  width: 100%;
  background: var(--bg-elevated);
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: var(--shadow-card);
}

.table-header {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-default);
}

.table-header-cell {
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  text-align: left;
}

.table-row {
  border-bottom: 1px solid var(--border-light);
  transition: background 150ms ease-out;
}

.table-row:hover {
  background: var(--bg-tertiary);
}

.table-cell {
  padding: var(--space-4);
  font-size: var(--text-sm);
  color: var(--text-primary);
}
```

### Form Components

```css
.input {
  width: 100%;
  height: 40px;
  padding: 0 var(--space-3);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  font-size: var(--text-base);
  color: var(--text-primary);
  transition: all 150ms ease-out;
}

.input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-primary-light);
}

.input-label {
  display: block;
  margin-bottom: var(--space-2);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--text-primary);
}

.input-hint {
  margin-top: var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}
```

## Layout Patterns

### Page Structure

```css
.page-container {
  min-height: 100vh;
  background: var(--bg-secondary);
}

.page-header {
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-light);
  padding: var(--space-4) var(--space-6);
  box-shadow: var(--shadow-xs);
}

.page-content {
  max-width: 1440px;
  margin: 0 auto;
  padding: var(--space-8) var(--space-6);
}

.content-grid {
  display: grid;
  gap: var(--space-6);
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}
```

### Navigation

```css
.nav {
  display: flex;
  align-items: center;
  height: 64px;
  padding: 0 var(--space-6);
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-light);
}

.nav-logo {
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
  color: var(--text-primary);
}

.nav-menu {
  display: flex;
  gap: var(--space-2);
  margin-left: auto;
}

.nav-link {
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--text-secondary);
  border-radius: var(--radius-md);
  transition: all 150ms ease-out;
}

.nav-link:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}

.nav-link-active {
  color: var(--accent-primary);
  background: var(--accent-primary-light);
}
```

## Animation & Interaction

### Transitions

```css
/* Standard Transitions */
--transition-fast: 150ms ease-out;
--transition-base: 200ms ease-out;
--transition-slow: 300ms ease-out;

/* Hover States */
- All interactive elements: transform, box-shadow, background
- Cards: Subtle elevation on hover
- Buttons: Slight translate-y and shadow increase
- Links: Color change with smooth transition

/* Loading States */
.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-tertiary) 0%,
    var(--bg-secondary) 50%,
    var(--bg-tertiary) 100%
  );
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;
}

@keyframes skeleton-loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

### Micro-interactions

1. **Button Press**: Scale(0.98) on active state
2. **Card Hover**: Elevate with shadow transition
3. **Input Focus**: Border color change + focus ring
4. **Dropdown**: Fade in/out with slight scale
5. **Toggle**: Smooth position transition
6. **Data Update**: Subtle highlight flash

## Implementation Notes

### CSS Architecture

1. **Use CSS Variables**: All design tokens as CSS custom properties
2. **Utility Classes**: Leverage Tailwind for rapid development
3. **Component Classes**: BEM methodology for complex components
4. **Responsive**: Mobile-first with container queries where supported

### Performance Considerations

1. **GPU Acceleration**: Use transform and opacity for animations
2. **Will-change**: Apply sparingly for known animations
3. **Reduce Paint**: Avoid animating layout properties
4. **CSS Containment**: Use contain property for complex components

### Accessibility Requirements

1. **Focus States**: Clear visible focus indicators
2. **Color Contrast**: Minimum 4.5:1 for normal text
3. **Touch Targets**: Minimum 44x44px on mobile
4. **Motion**: Respect prefers-reduced-motion
5. **Semantic HTML**: Proper heading hierarchy and landmarks

### Migration Strategy

1. **Phase 1**: Create new CSS variables alongside existing
2. **Phase 2**: Build component library with new styles
3. **Phase 3**: Gradually replace components in app
4. **Phase 4**: A/B test and gather metrics
5. **Phase 5**: Full rollout based on data

## Code Examples

### React Component with New Styles

```tsx
const MetricCard = ({ label, value, change }) => (
  <div className="metric-card">
    <div className="metric-value">{value}</div>
    <div className="metric-label">{label}</div>
    {change && (
      <div className={`metric-change ${change > 0 ? 'metric-change-positive' : 'metric-change-negative'}`}>
        {change > 0 ? '↑' : '↓'} {Math.abs(change)}%
      </div>
    )}
  </div>
);
```

### Tailwind Config Extension

```js
module.exports = {
  theme: {
    extend: {
      colors: {
        'accent': {
          DEFAULT: '#6366F1',
          hover: '#5558E3',
          light: '#E0E2FF',
          dark: '#4C1D95',
        }
      },
      boxShadow: {
        'card': '0 0 0 1px rgba(0, 0, 0, 0.05), 0 2px 4px rgba(0, 0, 0, 0.04)',
        'elevated': '0 0 0 1px rgba(0, 0, 0, 0.05), 0 4px 8px rgba(0, 0, 0, 0.06)',
      }
    }
  }
}
```

## Key Differentiators from Current Design

| Current (Dark Theme) | New (OpenRouter Style) |
|---------------------|------------------------|
| Dark backgrounds | Light, airy backgrounds |
| Heavy borders | Subtle shadows for depth |
| Aggressive colors | Muted, professional palette |
| Dense layouts | Generous whitespace |
| Gaming aesthetic | Enterprise professional |
| Sharp corners | Soft, rounded corners |
| High contrast | Subtle, refined contrast |

## Success Metrics

1. **Visual Hierarchy**: Users can scan and find information 30% faster
2. **Trust Perception**: Professional appearance increases conversion
3. **Accessibility**: WCAG 2.1 AA compliance achieved
4. **Performance**: No degradation in render performance
5. **Brand Recognition**: Consistent, memorable visual identity

## Conclusion

This OpenRouter-inspired aesthetic transforms the application from a technical tool to a professional platform. The design emphasizes trust, clarity, and sophistication through restraint rather than embellishment. Every design decision supports the core user goal: making complex trading data accessible and actionable.