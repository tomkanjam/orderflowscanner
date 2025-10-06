# Tier Selection Modal for Signal Creation

**Status**: 🔨 implementing
**Created**: 2025-10-06
**Updated**: 2025-10-06
**Progress**: [=         ] 10%

---

## Idea Review
*Stage: idea | Date: 2025-10-06*

### Problem Statement
Anonymous users need a clear path to understand the tier structure and upgrade when they want to create custom signals with AI. Currently, there's no prominent "Create Signal" CTA or visual explanation of the tier benefits.

### Proposed Solution
Add a "Create Signal with AI" button at the top of the sidebar (above TraderList) that triggers a tier selection modal. The modal will clearly show:
1. **Anonymous/Guest** - Current state, access to built-in signals only
2. **Starter (Free)** - Adds sound notifications and signal watchlist
3. **Lite ($39)** - Create custom signals with AI (no coding required)
4. **Pro (Coming Soon)** - Full AI trading with cloud execution and multi-channel notifications

This provides a clear upgrade funnel and educates users about the value proposition at each tier.

### Success Criteria
- [ ] Anonymous users can easily discover how to create custom signals
- [ ] Clear value proposition for each tier
- [ ] Smooth transition from anonymous → authenticated → paid tier
- [ ] Modal follows existing design system (OpenRouter style)
- [ ] Mobile-responsive design

---

## UI/UX Design
*Stage: design | Date: 2025-10-06*

### Design Overview
The tier selection modal presents a vertical pricing card layout with progressive disclosure of features. It leverages the existing OpenRouter design system with clean cards, clear typography hierarchy, and semantic colors. The design emphasizes the AI-powered signal creation as the primary value proposition while maintaining consistency with the crypto trading aesthetic (neon terminal theme).

### User Flow
```mermaid
graph LR
    A[Anonymous User] --> B[Clicks 'Create Signal with AI']
    B --> C[Tier Selection Modal Opens]
    C --> D{User Choice}
    D --> E[Stay Anonymous - View Built-in Signals]
    D --> F[Sign In - Get Starter Free]
    D --> G[Upgrade to Lite - $39]
    D --> H[Learn About Pro - Coming Soon]
    F --> I[EmailAuthModal]
    I --> J[Free Tier Access]
    G --> K[Payment Flow]
    K --> L[Lite Tier Access + TraderForm]
```

### Component Structure

#### Desktop Layout (Primary)
```
┌─────────────────────────────────────────────────────────┐
│                    Sidebar (Left 1/3)                   │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────┐  │
│  │ [✨ Create Signal with AI]  ← NEW BUTTON        │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  TraderList (existing)                                   │
│  ...                                                     │
└─────────────────────────────────────────────────────────┘

                    ↓ (Click button)

┌──────────────────────────────────────────────────────────┐
│                Modal Overlay (Full Screen)                │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Choose Your Plan                              [×] │  │
│  │  Start creating custom signals with AI              │  │
│  ├────────────────────────────────────────────────────┤  │
│  │                                                     │  │
│  │  ┌──────────────────────────────────────────────┐ │  │
│  │  │ GUEST (Current)                              │ │  │
│  │  │ ✓ View all built-in signals                 │ │  │
│  │  │ ✓ Real-time price charts                    │ │  │
│  │  │ ✓ Basic market data                         │ │  │
│  │  │                                              │ │  │
│  │  │ [Continue as Guest]                          │ │  │
│  │  └──────────────────────────────────────────────┘ │  │
│  │                                                     │  │
│  │  ┌──────────────────────────────────────────────┐ │  │
│  │  │ STARTER - FREE                    [POPULAR]  │ │  │
│  │  │ Everything in Guest, plus:                   │ │  │
│  │  │ ✓ Sound notifications                        │ │  │
│  │  │ ✓ Signal watchlist/favorites                │ │  │
│  │  │ ✓ Signal history                             │ │  │
│  │  │                                              │ │  │
│  │  │ [Sign In to Get Started]                     │ │  │
│  │  └──────────────────────────────────────────────┘ │  │
│  │                                                     │  │
│  │  ┌──────────────────────────────────────────────┐ │  │
│  │  │ LITE - $39/month               [RECOMMENDED] │ │  │
│  │  │ Everything in Starter, plus:                 │ │  │
│  │  │ ✨ Create custom signals with AI             │ │  │
│  │  │ ✓ Up to 10 custom signals                    │ │  │
│  │  │ ✓ No coding required                         │ │  │
│  │  │ ✓ Natural language trading strategies        │ │  │
│  │  │                                              │ │  │
│  │  │ [Upgrade to Lite]                            │ │  │
│  │  └──────────────────────────────────────────────┘ │  │
│  │                                                     │  │
│  │  ┌──────────────────────────────────────────────┐ │  │
│  │  │ PRO - Coming Soon                  [LOCKED]  │ │  │
│  │  │ Everything in Lite, plus:                    │ │  │
│  │  │ 🤖 Fully autonomous AI trading               │ │  │
│  │  │ ☁️ Persistent signals (cloud execution)      │ │  │
│  │  │ 📧 Email/SMS/Telegram/Discord notifications  │ │  │
│  │  │ ♾️ Unlimited custom signals                   │ │  │
│  │  │                                              │ │  │
│  │  │ [Join Waitlist]                              │ │  │
│  │  └──────────────────────────────────────────────┘ │  │
│  │                                                     │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

#### Mobile Layout (< 768px)
```
┌──────────────────────┐
│  Choose Your Plan [×]│
├──────────────────────┤
│                      │
│  [GUEST Card]        │
│  (Condensed)         │
│  [Continue as Guest] │
│                      │
│  [STARTER Card]      │
│  (Condensed)         │
│  [Sign In]           │
│                      │
│  [LITE Card]         │
│  (Condensed)         │
│  [Upgrade]           │
│                      │
│  [PRO Card]          │
│  (Condensed)         │
│  [Waitlist]          │
│                      │
└──────────────────────┘
  (Scrollable)
```

### Visual Specifications

#### Typography
Following OpenRouter style guide:
- **Modal Title**: `or-h2` (32px, weight 600, spacing tight)
- **Tier Names**: `or-h4` (20px, weight 600)
- **Feature Lists**: `or-text-body` (15px, line-height 1.6)
- **Prices**: `or-h3` (28px, weight 700, monospace for numbers)
- **Badges**: `or-text-xs` (11px, uppercase, weight 600)

#### Color Palette
Following Neon Terminal theme with OpenRouter structure:
- **Primary Action**: `#6366F1` (Indigo) - Lite tier CTA
- **Success/Free**: `#16A34A` (Green) - Starter tier
- **Warning/Coming**: `#F59E0B` (Amber) - Pro tier badge
- **Neutral/Guest**: `#8B949E` (Gray) - Current tier
- **Background**: `var(--nt-bg-secondary)` - Modal cards
- **Border**: `var(--nt-border-default)` - Card borders
- **Accent**: `var(--nt-accent-lime)` - Highlights and icons

#### Spacing
- **Grid**: 8px base unit
- **Card Padding**: 24px (desktop), 16px (mobile)
- **Card Gap**: 16px vertical spacing
- **Section Margins**: 24px between tier cards
- **Button Padding**: 12px vertical, 24px horizontal

### Component Designs

#### TierSelectionModal Component
**Purpose**: Present tier options to guide user toward creating custom signals
**Location**: Triggered by "Create Signal with AI" button in Sidebar

**Visual Design**:
```
┌─────────────────────────────────────────────────┐
│  Choose Your Plan                          [×]  │
│  Start creating custom signals with AI          │
├─────────────────────────────────────────────────┤
│                                                  │
│  [Tier Cards in vertical stack...]              │
│                                                  │
└─────────────────────────────────────────────────┘
```

**States**:
- Default: All tiers visible with appropriate actions
- Loading: Skeleton loaders for tier data
- Error: Error message with retry option
- Post-Auth: Highlight newly available tier after sign-in

**Interactions**:
- Click outside modal: Close modal
- ESC key: Close modal
- Click tier CTA:
  - Guest → Stay on current view
  - Starter → Open EmailAuthModal
  - Lite → Navigate to payment flow (future)
  - Pro → Show "Join Waitlist" form

**Accessibility**:
- Focus trap within modal
- Keyboard navigation (Tab through cards)
- Screen reader: Announce tier name, price, features
- High contrast mode: Maintain border visibility

#### Create Signal Button (NEW)
**Purpose**: Primary CTA to discover AI signal creation
**Location**: Top of Sidebar, above TraderList

**Visual Design**:
```
┌────────────────────────────────────────┐
│  ✨ Create Signal with AI              │
└────────────────────────────────────────┘
```

**States**:
- Default: Gradient background with shimmer effect
- Hover: Lift shadow, brighten gradient
- Active: Scale down slightly (0.98)
- Focus: Thick lime border

**Styling**:
```css
background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%);
color: white;
font-weight: 600;
padding: 12px 20px;
border-radius: 8px;
box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
transition: all 0.2s ease;

&:hover {
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.6);
  transform: translateY(-2px);
}
```

#### Tier Card Component
**Purpose**: Display individual tier information
**Location**: Within TierSelectionModal

**Visual Design**:
```
┌────────────────────────────────────────────┐
│  TIER NAME            [BADGE]              │
│  $XX/month or FREE                         │
│                                            │
│  Everything in [previous tier], plus:      │
│  ✓ Feature 1                               │
│  ✓ Feature 2                               │
│  ✓ Feature 3                               │
│                                            │
│  [CTA Button]                              │
└────────────────────────────────────────────┘
```

**States**:
- Default: Subtle border, white background
- Current Tier: Green border, success badge
- Recommended: Purple border, "RECOMMENDED" badge, slight glow
- Popular: Blue border, "POPULAR" badge
- Locked: Muted colors, "COMING SOON" badge
- Hover: Lift shadow, subtle scale

**Badges**:
- **CURRENT**: `or-badge or-badge-success` (green)
- **POPULAR**: `or-badge or-badge-primary` (blue)
- **RECOMMENDED**: `or-badge or-badge-primary` (purple)
- **LOCKED**: `or-badge or-badge-default` (gray)

### Data Visualization

No charts or complex data visualization needed for this modal. Focus is on clear hierarchy and scannable feature lists.

### Responsive Behavior

#### Breakpoints
- **Desktop**: >1024px (4-column card layout in 2x2 grid - FUTURE)
- **Tablet**: 768-1024px (stacked vertical cards with full width)
- **Mobile**: <768px (single column, full width cards, reduced padding)

#### Progressive Disclosure
- **Desktop**: All features visible, cards slightly larger
- **Tablet**: All features visible, cards full width
- **Mobile**: Essential features only, "See all features" expand link

#### Modal Sizing
- **Desktop**: max-width 900px, centered
- **Tablet**: max-width 90vw, centered
- **Mobile**: 100vw, full height, bottom sheet style slide-up

### Accessibility

#### WCAG 2.1 AA Compliance
- **Color Contrast**:
  - Text on cards: 7:1 (AAA)
  - Badges: 4.5:1 minimum
  - Disabled text: 3:1
- **Focus Indicators**:
  - 3px lime border on focus
  - Visible on all interactive elements
- **Screen Reader**:
  - `aria-label` on modal: "Subscription tier selection"
  - `aria-describedby` linking tier cards to feature lists
  - `role="dialog"` on modal
  - `aria-modal="true"`
- **Keyboard**:
  - Tab: Navigate between cards and CTAs
  - Shift+Tab: Reverse navigation
  - ESC: Close modal
  - Enter/Space: Activate focused CTA

#### Trading-Specific
- **Quick Scanning**: Bold prices, large tier names
- **Feature Icons**: Visual checkmarks for quick comprehension
- **Color-blind Safe**: Icons supplement color-coded badges
- **Mobile Touch**: 44px minimum touch targets

### Animation & Transitions

#### Performance First
- CSS transforms only (no layout thrashing)
- 60fps target
- GPU acceleration for modal open/close
- No animations during data loading

#### Meaningful Motion
```css
/* Modal Enter */
@keyframes modalFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Card Hover */
.tier-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Button Click */
.tier-cta:active {
  transform: scale(0.98);
  transition: transform 0.1s;
}

/* Badge Pulse (Popular) */
@keyframes badgePulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
```

#### Timing
- Modal open: 200ms ease-out
- Modal close: 150ms ease-in
- Card hover: 200ms ease
- Button interactions: 100ms ease

### Dark/Light Theme

This app uses **Dark Theme Only** (Neon Terminal theme).

#### Dark Theme Colors
```css
--modal-bg: #1a1a1a;
--card-bg: #0a0a0a;
--card-border: rgba(255, 255, 255, 0.1);
--text-primary: #ffffff;
--text-secondary: #b4b4b4;
--text-muted: #6b6b6b;
--accent-lime: #84cc16;
--accent-purple: #8B5CF6;
--accent-indigo: #6366F1;
```

### Implementation Notes

#### Component Library
- **Use existing**:
  - `Modal.tsx` - Base modal component (requires extension)
  - `or-button`, `or-badge`, `or-card` - From OpenRouter design system
- **Create new**:
  - `TierSelectionModal.tsx` - New modal component
  - `TierCard.tsx` - Reusable tier card component
  - `CreateSignalButton.tsx` - Prominent CTA button
- **Modify**:
  - `Sidebar.tsx` - Add CreateSignalButton at top
  - `TraderList.tsx` - Shift down to accommodate new button

#### Component Props

```typescript
// TierSelectionModal.tsx
interface TierSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTier: 'anonymous' | 'free' | 'pro' | 'elite';
  onSelectTier: (tier: string) => void;
}

// TierCard.tsx
interface TierCardProps {
  name: string;
  price: number | 'free';
  badge?: 'current' | 'popular' | 'recommended' | 'locked';
  features: string[];
  ctaText: string;
  ctaAction: () => void;
  isCurrentTier: boolean;
  isLocked: boolean;
}

// CreateSignalButton.tsx
interface CreateSignalButtonProps {
  onClick: () => void;
}
```

#### Technical Constraints
- Modal must work with existing `Modal.tsx` base component
- Must integrate with `EmailAuthModal` flow
- Respect existing tier access checks from `tierAccess.ts`
- Must handle anonymous → free transition smoothly
- Future: Payment integration for Lite tier

#### State Management
```typescript
// In Sidebar.tsx
const [showTierModal, setShowTierModal] = useState(false);
const [showAuthModal, setShowAuthModal] = useState(false);

const handleCreateSignal = () => {
  setShowTierModal(true);
};

const handleTierSelect = (tier: string) => {
  switch(tier) {
    case 'guest':
      setShowTierModal(false);
      break;
    case 'starter':
      setShowTierModal(false);
      setShowAuthModal(true);
      break;
    case 'lite':
      // TODO: Navigate to payment flow
      console.log('Payment flow not implemented');
      break;
    case 'pro':
      // TODO: Show waitlist form
      console.log('Waitlist not implemented');
      break;
  }
};
```

### Design Validation

#### Usability Testing
- [ ] Users can identify their current tier within 2 seconds
- [ ] Users understand value proposition of each tier
- [ ] CTA buttons are clear and action-oriented
- [ ] Mobile users can scroll and interact comfortably
- [ ] Accessibility standards verified with screen reader

#### Performance Metrics
- [ ] Modal opens in <100ms
- [ ] No layout shift when modal opens
- [ ] Smooth 60fps animations
- [ ] Works on mobile 3G connection

#### Visual Quality
- [ ] Follows OpenRouter design system
- [ ] Maintains Neon Terminal aesthetic
- [ ] Clear visual hierarchy
- [ ] Consistent spacing and alignment
- [ ] Professional appearance appropriate for crypto trading app

---

## Tier Feature Breakdown

### Anonymous/Guest (Current)
- ✓ View all built-in signals
- ✓ Real-time price charts
- ✓ Basic market data
- ✓ Live signal triggers (view only)

### Starter (Free - Requires Auth)
**Everything in Guest, plus:**
- ✓ Sound notifications for signals
- ✓ Signal watchlist/favorites
- ✓ Signal trigger history
- ✓ Persistent preferences

### Lite ($39/month)
**Everything in Starter, plus:**
- ✨ **Create custom signals with AI** (main value prop)
- ✓ Up to 10 custom signals
- ✓ No coding required
- ✓ Natural language trading strategies
- ✓ Save and edit custom signals

### Pro (Coming Soon)
**Everything in Lite, plus:**
- 🤖 Fully autonomous AI trading
- ☁️ Persistent signals (run 24/7 in cloud)
- 📧 Email notifications
- 📱 SMS notifications
- 💬 Telegram notifications
- 🎮 Discord notifications
- ♾️ Unlimited custom signals
- 📊 Advanced analytics

---

## System Architecture
*Stage: architecture | Date: 2025-10-06*

### Executive Summary
This feature adds a tier discovery and upgrade funnel through a prominent "Create Signal with AI" button and tier selection modal. The architecture leverages existing authentication (EmailAuthModal), subscription management (SubscriptionContext), and tier access systems (tierAccess.ts) to create a seamless upgrade path from anonymous → free → paid tiers. The solution is implemented entirely in the frontend with no backend changes required, using static tier configuration data.

### System Design

#### Data Models

```typescript
// Tier configuration (static data, no database changes)
export interface TierConfig {
  id: 'guest' | 'starter' | 'lite' | 'pro';
  name: string;
  displayName: string;
  price: number | 'free';
  priceDisplay: string;
  badge?: 'current' | 'popular' | 'recommended' | 'locked';
  features: string[];
  ctaText: string;
  ctaAction: 'close' | 'auth' | 'upgrade' | 'waitlist';
  description: string;
  highlighted?: boolean;
  isLocked?: boolean;
}

// Map tier IDs to SubscriptionTier enum
export const TIER_MAPPING: Record<string, SubscriptionTier | 'anonymous'> = {
  guest: 'anonymous',
  starter: 'free',
  lite: 'pro',  // Maps to PRO tier in database
  pro: 'elite'  // Maps to ELITE tier in database (coming soon)
};

// Tier configurations (lives in new constants file)
export const TIER_CONFIGS: TierConfig[] = [
  {
    id: 'guest',
    name: 'Guest',
    displayName: 'GUEST',
    price: 'free',
    priceDisplay: 'Free',
    features: [
      'View all built-in signals',
      'Real-time price charts',
      'Basic market data',
      'Live signal triggers (view only)'
    ],
    ctaText: 'Continue as Guest',
    ctaAction: 'close',
    description: 'Current tier - Browse signals without signing in'
  },
  {
    id: 'starter',
    name: 'Starter',
    displayName: 'STARTER',
    price: 'free',
    priceDisplay: 'Free',
    badge: 'popular',
    features: [
      'Everything in Guest, plus:',
      'Sound notifications for signals',
      'Signal watchlist/favorites',
      'Signal trigger history',
      'Persistent preferences'
    ],
    ctaText: 'Sign In to Get Started',
    ctaAction: 'auth',
    description: 'Sign in with email to unlock notifications and history',
    highlighted: true
  },
  {
    id: 'lite',
    name: 'Lite',
    displayName: 'LITE',
    price: 39,
    priceDisplay: '$39/month',
    badge: 'recommended',
    features: [
      'Everything in Starter, plus:',
      '✨ Create custom signals with AI',
      'Up to 10 custom signals',
      'No coding required',
      'Natural language trading strategies',
      'Save and edit custom signals'
    ],
    ctaText: 'Upgrade to Lite',
    ctaAction: 'upgrade',
    description: 'Unlock AI-powered signal creation',
    highlighted: true
  },
  {
    id: 'pro',
    name: 'Pro',
    displayName: 'PRO',
    price: 'coming-soon',
    priceDisplay: 'Coming Soon',
    badge: 'locked',
    isLocked: true,
    features: [
      'Everything in Lite, plus:',
      '🤖 Fully autonomous AI trading',
      '☁️ Persistent signals (run 24/7)',
      '📧 Email/SMS/Telegram/Discord',
      '♾️ Unlimited custom signals',
      '📊 Advanced analytics'
    ],
    ctaText: 'Join Waitlist',
    ctaAction: 'waitlist',
    description: 'Full AI trading automation (in development)'
  }
];

// Component props
interface TierSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthRequired: () => void;  // Triggers EmailAuthModal
  onUpgradeRequired: (tier: string) => void;  // Future payment flow
}

interface TierCardProps {
  config: TierConfig;
  isCurrentTier: boolean;
  onClick: () => void;
}

interface CreateSignalButtonProps {
  onClick: () => void;
  className?: string;
}
```

#### Component Architecture

**New Components:**
- `CreateSignalButton.tsx`: Primary CTA button with gradient styling
- `TierSelectionModal.tsx`: Modal container orchestrating tier cards
- `TierCard.tsx`: Reusable pricing card component
- `constants/tiers.ts`: Static tier configuration data

**Modified Components:**
- `Sidebar.tsx`: Add CreateSignalButton at top of sidebar, manage modal state
- `TraderList.tsx`: No changes (modal sits above it visually)

**Component Hierarchy:**
```
Sidebar
├── CreateSignalButton (NEW)
│   └── onClick → setShowTierModal(true)
├── TierSelectionModal (NEW)
│   ├── isOpen={showTierModal}
│   ├── onClose={() => setShowTierModal(false)}
│   ├── onAuthRequired={() => setShowAuthModal(true)}
│   └── TierCard[] (4 cards: guest, starter, lite, pro)
│       ├── TierCard (guest)
│       ├── TierCard (starter) → auth flow
│       ├── TierCard (lite) → upgrade flow (future)
│       └── TierCard (pro) → waitlist (future)
├── EmailAuthModal (existing)
│   └── isOpen={showAuthModal}
└── TraderList (existing, unchanged)
```

#### Service Layer

**No New Services Required** - Uses existing services:

```typescript
// Existing services leveraged
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuth } from '../hooks/useAuth';
import { getTierDisplayName, getTierColor } from '../utils/tierAccess';

// Modal state management in Sidebar.tsx
const [showTierModal, setShowTierModal] = useState(false);
const [showAuthModal, setShowAuthModal] = useState(false);

// Tier action handlers
const handleTierSelect = (action: string, tierId: string) => {
  switch (action) {
    case 'close':
      setShowTierModal(false);
      break;
    case 'auth':
      setShowTierModal(false);
      setShowAuthModal(true);
      break;
    case 'upgrade':
      setShowTierModal(false);
      console.log('Payment flow not implemented for tier:', tierId);
      // TODO: Navigate to payment page
      break;
    case 'waitlist':
      setShowTierModal(false);
      console.log('Waitlist signup for tier:', tierId);
      // TODO: Show waitlist form
      break;
  }
};
```

**API Endpoints:** None required - all frontend

#### Data Flow

```
1. User Action Flow (Anonymous User)
   └── Click "Create Signal with AI" Button
       └── Sidebar sets showTierModal = true
           └── TierSelectionModal renders
               ├── Reads currentTier from SubscriptionContext
               ├── Renders 4 TierCard components
               └── User clicks Starter CTA
                   └── handleTierSelect('auth', 'starter')
                       ├── setShowTierModal(false)
                       └── setShowAuthModal(true)
                           └── EmailAuthModal opens
                               └── User authenticates
                                   └── SubscriptionContext refreshes
                                       └── currentTier = 'free'
                                           └── User sees Starter features

2. User Action Flow (Authenticated User - Free Tier)
   └── Click "Create Signal with AI" Button
       └── TierSelectionModal renders
           ├── Starter card shows "CURRENT" badge
           ├── Lite card shows "RECOMMENDED" badge
           └── User clicks Lite CTA
               └── handleTierSelect('upgrade', 'lite')
                   └── Future: Navigate to payment page

3. Modal Close Flow
   └── User clicks outside modal OR ESC key OR X button
       └── onClose callback
           └── setShowTierModal(false)
```

#### State Management

**State Structure (in Sidebar.tsx):**
```typescript
// Local component state
const [showTierModal, setShowTierModal] = useState(false);
const [showAuthModal, setShowAuthModal] = useState(false);

// Global state (from contexts)
const { user } = useAuthContext();
const { currentTier, profile, canCreateSignal } = useSubscription();
```

**State Updates:**
- Synchronous: Modal open/close state transitions
- Asynchronous: Post-authentication tier refresh (handled by SubscriptionContext)
- No Optimistic Updates: Tier changes require backend confirmation

### Technical Specifications

#### API Contracts

**No API Changes Required** - Uses existing:
```typescript
// SubscriptionContext already provides:
interface SubscriptionContextType {
  currentTier: SubscriptionTier | 'anonymous';
  canCreateSignal: () => boolean;
  remainingSignals: number;
  // ... existing methods
}

// EmailAuthModal already handles:
interface EmailAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess?: () => void;
  pendingPrompt?: string;
}
```

#### Database Schema

**No Database Changes** - Uses existing tables:
- `user_profiles` (existing)
- `user_subscriptions` (existing)
- `user_preferences` (existing)

Tier names in design map to existing database values:
| Design Tier | Database Value | Notes |
|------------|----------------|-------|
| Guest | `anonymous` (no row) | Not authenticated |
| Starter | `free` | Default for new users |
| Lite | `pro` | $39/month tier |
| Pro | `elite` | Coming soon (hidden) |

#### Caching Strategy

**Client Cache:**
- Tier configurations: Static constants, no caching needed
- User tier: Cached in SubscriptionContext
- TTL: N/A (refreshed on auth state change)

**Memory Cache:**
- TierConfig array: Imported as constant
- Component memoization: React.memo for TierCard

**Cache Invalidation:**
- On authentication: SubscriptionContext.refreshSubscription()
- On logout: Context resets to null
- On payment success: Manual refresh (future)

### Integration Points

#### Existing Systems

**SubscriptionContext:**
- Provides `currentTier` for badge logic
- Provides `canCreateSignal()` for access control
- Auto-refreshes on auth state changes

**EmailAuthModal:**
- Triggered by "Sign In to Get Started" CTA
- Handles magic link authentication
- Calls `onAuthSuccess` to close tier modal

**TraderForm:**
- No direct integration
- Future: May be opened automatically after Lite upgrade
- Already has tier checking logic for custom signals

#### Event Flow

```typescript
// Events emitted (via React state)
'tier-modal:open' → setShowTierModal(true)
'tier-modal:close' → setShowTierModal(false)
'auth-modal:open' → setShowAuthModal(true)
'tier-selected' → handleTierSelect(action, tierId)

// Events consumed
'auth:success' → SubscriptionContext.refreshSubscription()
'user:logout' → Reset to anonymous tier
```

### Non-Functional Requirements

#### Performance Targets

- **Modal Open Time**: <100ms (CSS animation only)
- **Tier Card Render**: <16ms per card (60fps)
- **Button Interaction**: <50ms response time
- **Memory**: <500KB total (modal + cards + images)

#### Scalability Plan

- **Concurrent Users**: N/A (frontend only, no backend load)
- **Tier Configs**: 4 tiers (static, no growth expected)
- **Modal Instances**: 1 per user session (lazy loaded)

#### Reliability

**Error Recovery:**
- Modal fails to open → Fallback to existing TraderList "Create" button
- Auth modal fails → Show error message with retry
- No try/catch needed (no async operations in tier selection)

**Fallback:**
- If SubscriptionContext fails → Assume anonymous tier
- If TierCard fails to render → Skip that card
- Graceful degradation to current UI

**Circuit Breaker:**
- N/A (no external API calls)

### Implementation Guidelines

#### Code Organization

```
src/
  components/
    tiers/
      CreateSignalButton.tsx       // Primary CTA button
      TierSelectionModal.tsx       // Modal container
      TierCard.tsx                 // Individual tier card
      index.ts                     // Re-exports
  constants/
    tiers.ts                       // TIER_CONFIGS array
  components/
    Sidebar.tsx                    // Modified: add button + modal
  types/
    subscription.types.ts          // No changes (already has types)
  utils/
    tierAccess.ts                  // No changes (already has helpers)
```

#### Design Patterns

**Pattern: Composition**
- TierSelectionModal composes TierCard components
- Each TierCard is self-contained with its own styling

**Pattern: Configuration-Driven**
- Static TIER_CONFIGS drives all tier rendering
- Easy to modify tiers without touching component logic

**Pattern: Controlled Components**
- Modal state controlled by parent (Sidebar)
- Enables coordination with other modals (EmailAuthModal)

#### Error Handling

```typescript
// Minimal error handling needed (no async operations)
try {
  handleTierSelect(action, tierId);
} catch (error) {
  console.error('[TierModal] Error handling tier selection:', error);
  // Log but don't show to user (user can retry click)
}

// Focus management errors
try {
  firstTierCardRef.current?.focus();
} catch (error) {
  console.warn('[TierModal] Failed to set focus:', error);
  // Non-critical, skip
}
```

### Security Considerations

#### Data Validation

```typescript
// Validate tier action (prevent malicious tier IDs)
const VALID_ACTIONS = ['close', 'auth', 'upgrade', 'waitlist'];

const handleTierSelect = (action: string, tierId: string) => {
  if (!VALID_ACTIONS.includes(action)) {
    console.error('[TierModal] Invalid action:', action);
    return;
  }

  const validTier = TIER_CONFIGS.find(t => t.id === tierId);
  if (!validTier) {
    console.error('[TierModal] Invalid tier ID:', tierId);
    return;
  }

  // Proceed with action
  switch (action) { /* ... */ }
};
```

#### Authorization

**Tier-based:**
- Guest: Can view modal, cannot create signals
- Starter: Can view modal, cannot create signals
- Lite: Can view modal, can create up to 10 signals (checked by SubscriptionContext)
- Pro: Hidden tier (not shown in modal yet)

**No Rate Limiting:** Frontend only, no API calls

### Deployment Considerations

#### Configuration

```typescript
// Environment variables (none needed for this feature)
// All config is static in codebase

// Feature flags (optional)
export const FEATURE_FLAGS = {
  SHOW_TIER_MODAL: true,
  SHOW_PRO_TIER: false,  // Hide Pro tier until ready
  ENABLE_PAYMENT: false   // Future: enable payment flow
};
```

#### Feature Flags

- `feature.tier-modal.enabled`: Toggle entire feature (default: true)
- `feature.tier-modal.show-pro`: Show Pro tier card (default: false)
- `feature.tier-modal.enable-payment`: Enable Lite tier payment (default: false)

#### Monitoring

**Metrics:**
- `tier-modal.opened`: Count of modal opens
- `tier-modal.action.{action}`: Count by action type
- `tier-modal.conversion.auth`: Starter tier sign-ups
- `tier-modal.conversion.upgrade`: Lite tier upgrades (future)

**Alerts:** None needed (no critical path)

**Logging:**
```typescript
console.log('[TierModal] Modal opened, currentTier:', currentTier);
console.log('[TierModal] Tier selected:', { action, tierId });
console.log('[TierModal] Auth flow triggered for tier:', tierId);
```

### Migration Strategy

**No Migration Required** - Pure frontend addition

#### Data Migration
- N/A (no database changes)

#### Backward Compatibility
- Fully compatible: New button + modal are additive
- Existing TraderList "Create" button remains functional
- Users can still create signals via existing flow

### Testing Strategy

#### Test Coverage Requirements
- Unit: >80% for new components
- Integration: Modal state coordination
- E2E: Full upgrade funnel flow

#### Test Scenarios

**1. Happy Path (Anonymous → Starter):**
```typescript
test('anonymous user can sign up for Starter tier', async () => {
  // Arrange
  render(<Sidebar />);

  // Act
  click('Create Signal with AI');
  expect(tierModal).toBeVisible();

  click('Sign In to Get Started');
  expect(emailAuthModal).toBeVisible();

  enterEmail('test@example.com');
  click('Send Magic Link');

  // Assert
  await waitFor(() => {
    expect(currentTier).toBe('free');
  });
});
```

**2. Edge Cases:**
```typescript
test('modal closes on outside click', () => {
  click('Create Signal with AI');
  click(modalOverlay);
  expect(tierModal).not.toBeVisible();
});

test('ESC key closes modal', () => {
  click('Create Signal with AI');
  pressKey('Escape');
  expect(tierModal).not.toBeVisible();
});

test('already authenticated user sees current tier badge', () => {
  // User is on Starter tier
  click('Create Signal with AI');
  expect(starterCard).toHaveClass('current-tier');
  expect(starterBadge).toHaveText('CURRENT');
});
```

**3. Error Cases:**
```typescript
test('handles auth failure gracefully', async () => {
  click('Create Signal with AI');
  click('Sign In to Get Started');

  enterEmail('invalid-email');
  click('Send Magic Link');

  expect(errorMessage).toBeVisible();
  expect(tierModal).not.toBeVisible(); // Modal closed
  expect(emailAuthModal).toBeVisible(); // Auth modal still open
});
```

**4. Performance:**
```typescript
test('modal opens within 100ms', async () => {
  const start = performance.now();
  click('Create Signal with AI');
  const end = performance.now();

  expect(end - start).toBeLessThan(100);
  expect(tierModal).toBeVisible();
});
```

### Decision Log

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Use static tier configs | Simpler, no backend needed | Database-driven tiers (overkill) |
| Map "Lite" to "pro" tier | Existing DB enum doesn't match design | Rename enum (breaking change) |
| Single modal pattern | Consistent with EmailAuthModal | Inline pricing cards (too much clutter) |
| Configuration-driven cards | Easy to modify tiers | Hard-coded components (inflexible) |
| No payment integration yet | Phase 1 is discovery only | Full payment flow (too complex) |
| Use existing Modal.tsx | Reuse proven component | Build new modal (duplication) |

### Open Technical Questions

1. **Payment Integration:** Which payment provider to use for Lite tier? (Stripe recommended)
2. **Waitlist Storage:** Where to store Pro tier waitlist signups? (Future: Add supabase table)
3. **Analytics:** Should we track tier modal interactions? (Recommend: Add Plausible events)
4. **A/B Testing:** Test different pricing displays? (Out of scope for v1)

### Success Criteria

- [x] Architecture leverages existing auth and subscription systems
- [x] No database schema changes required
- [x] Component hierarchy is clean and maintainable
- [x] Configuration-driven tier cards for easy updates
- [x] Clear integration with EmailAuthModal
- [x] Handles all tier transitions (anonymous → free → pro → elite)
- [ ] Performance targets specified (<100ms modal open)
- [x] Security validation for tier actions
- [x] Test scenarios documented
- [x] Backward compatibility maintained

---

## Implementation Plan
*Stage: planning | Date: 2025-10-06*

### Overview
Implement a tier discovery and upgrade funnel through a prominent "Create Signal with AI" button and pricing modal. This is a **pure frontend feature** with no backend changes, using static configuration to drive a four-tier pricing display (Guest, Starter, Lite, Pro). The implementation leverages existing authentication (EmailAuthModal) and subscription management (SubscriptionContext) systems.

### Prerequisites
- [x] Architecture approved
- [x] Design specifications reviewed
- [x] Existing Modal.tsx component reviewed
- [x] SubscriptionContext API understood
- [ ] Development environment running (`pnpm dev`)
- [ ] Feature branch created from main

### Implementation Phases

#### Phase 0: Interactive Mockup (2-3 hours)
**Objective:** Validate UX approach before full implementation

##### Task 0.1: Create HTML/CSS Mockup (2 hours)
Files to create:
- `mockups/tier-selection-modal.html`
- `mockups/tier-modal-styles.css`

Actions:
- [x] Create static HTML mockup of tier modal with 4 cards <!-- ✅ 2025-10-06 -->
- [x] Style using TradeMind design system colors (from trademind-design-system.css) <!-- ✅ 2025-10-06 -->
- [x] Add "Create Signal with AI" button mockup <!-- ✅ 2025-10-06 -->
- [x] Include all badge variants (current, popular, recommended, locked) <!-- ✅ 2025-10-06 -->
- [x] Show mobile responsive behavior (< 768px) <!-- ✅ 2025-10-06 -->
- [x] Add basic JavaScript for: <!-- ✅ 2025-10-06 -->
  - [x] Modal open/close on button click <!-- ✅ 2025-10-06 -->
  - [x] Card hover states <!-- ✅ 2025-10-06 -->
  - [x] CTA button clicks with console.log <!-- ✅ 2025-10-06 -->
  - [x] ESC key to close <!-- ✅ 2025-10-06 -->
  - [x] Click outside to close <!-- ✅ 2025-10-06 -->
- [x] Include data states: <!-- ✅ 2025-10-06 -->
  - [x] Anonymous user view (no current tier badge) <!-- ✅ 2025-10-06 -->
  - [x] Free tier user view (Starter has "CURRENT" badge) <!-- ✅ 2025-10-06 -->
  - [x] Loading state (skeleton loaders) <!-- ✅ 2025-10-06 -->

Mockup Requirements:
- Desktop view: Cards vertically stacked, 900px max-width, centered
- Mobile view: Full-width cards, bottom sheet slide-up animation
- All tier features listed as per TIER_CONFIGS in architecture
- Gradient button styling for "Create Signal with AI"
- Focus states visible for accessibility

**⚠️ PM VALIDATION CHECKPOINT**
- [ ] PM approved tier card design and layout
- [ ] PM validated pricing display ($39/month for Lite)
- [ ] PM confirmed badge usage (popular, recommended, locked)
- [ ] PM validated mobile responsive behavior
- [ ] Feedback incorporated: _____________

**DO NOT PROCEED TO PHASE 1 WITHOUT PM APPROVAL**

Benefits validated:
- [ ] Tier value propositions are clear
- [ ] Upgrade funnel makes sense to PM
- [ ] Mobile experience is acceptable
- [ ] Button placement works in sidebar

**Phase 0 Complete When:**
- Mockup demonstrates all tier cards with correct styling
- Button opens/closes modal smoothly
- Mobile and desktop views work
- PM has signed off on approach
- Any design changes documented

#### Phase 1: Static Configuration & Types (1 hour)
**Objective:** Create tier configuration and TypeScript interfaces

##### Task 1.1: Create Tier Configuration (30 min)
Files to create:
- `apps/app/src/constants/tiers.ts`

Actions:
- [ ] Create `TierConfig` interface:
  ```typescript
  export interface TierConfig {
    id: 'guest' | 'starter' | 'lite' | 'pro';
    name: string;
    displayName: string;
    price: number | 'free' | 'coming-soon';
    priceDisplay: string;
    badge?: 'current' | 'popular' | 'recommended' | 'locked';
    features: string[];
    ctaText: string;
    ctaAction: 'close' | 'auth' | 'upgrade' | 'waitlist';
    description: string;
    highlighted?: boolean;
    isLocked?: boolean;
  }
  ```
- [ ] Create `TIER_CONFIGS` array with all 4 tiers (Guest, Starter, Lite, Pro)
- [ ] Create `TIER_MAPPING` to map tier IDs to SubscriptionTier enum
- [ ] Export `VALID_ACTIONS` constant for validation

Test criteria:
- [ ] File compiles with no TypeScript errors
- [ ] All tiers have required fields
- [ ] Can import in other files

**Checkpoint:** `import { TIER_CONFIGS } from '../constants/tiers'` works

##### Task 1.2: Create Component Prop Interfaces (30 min)
Files to modify:
- `apps/app/src/constants/tiers.ts` (add interfaces)

Actions:
- [ ] Add `TierSelectionModalProps` interface
- [ ] Add `TierCardProps` interface
- [ ] Add `CreateSignalButtonProps` interface
- [ ] Export all interfaces

Test criteria:
- [ ] All prop interfaces compile
- [ ] Interfaces match architecture spec
- [ ] No missing required props

**Phase 1 Complete When:**
- All type definitions in place
- TIER_CONFIGS array complete with all 4 tiers
- No TypeScript errors
- Configuration is importable

#### Phase 2: TierCard Component (2 hours)
**Objective:** Build reusable tier pricing card component

##### Task 2.1: Create TierCard Component (1.5 hours)
Files to create:
- `apps/app/src/components/tiers/TierCard.tsx`

Actions:
- [ ] Create functional component with TierCardProps
- [ ] Render tier header:
  - [ ] Display tier name (displayName)
  - [ ] Show badge if present (or-badge classes)
  - [ ] Apply badge color based on type
- [ ] Render pricing section:
  - [ ] Show price (or "Free" or "Coming Soon")
  - [ ] Style with or-h3 for price
- [ ] Render features list:
  - [ ] Map over features array
  - [ ] Add checkmark icon (✓) for each feature
  - [ ] Style with or-text-body
- [ ] Render CTA button:
  - [ ] Use tm-btn classes from design system
  - [ ] Apply variant: primary for highlighted, secondary for others
  - [ ] Show locked state for Pro tier
- [ ] Add card styling:
  - [ ] or-card base class
  - [ ] Conditional classes for current/highlighted state
  - [ ] Hover effect (transform translateY)
  - [ ] Border glow for highlighted cards
- [ ] Implement onClick handler to call props.onClick()
- [ ] Add keyboard support (Enter/Space to activate)

Test criteria:
- [ ] Card renders with mock config
- [ ] Badge shows correct color
- [ ] Features list displays properly
- [ ] CTA button is clickable
- [ ] Hover effects work
- [ ] Keyboard navigation works

**Checkpoint:** Can render TierCard in isolation with mock data

##### Task 2.2: Add TierCard Styling (30 min)
Files to create:
- `apps/app/src/components/tiers/TierCard.module.css` (or inline styles)

Actions:
- [ ] Add card container styles:
  - [ ] Padding: 24px (desktop), 16px (mobile)
  - [ ] Border radius: var(--tm-radius-lg)
  - [ ] Background: var(--tm-bg-secondary)
  - [ ] Border: 1px solid var(--tm-border)
- [ ] Add hover state:
  - [ ] Transform: translateY(-4px)
  - [ ] Box-shadow: 0 12px 24px rgba(0,0,0,0.15)
  - [ ] Transition: 200ms ease
- [ ] Add highlighted state:
  - [ ] Border: 2px solid var(--tm-accent)
  - [ ] Box-shadow: 0 0 20px rgba(142, 251, 186, 0.2)
- [ ] Add current tier state:
  - [ ] Border: 2px solid var(--tm-success)

Test criteria:
- [ ] Styles match design mockup
- [ ] Transitions are smooth
- [ ] Highlighted cards stand out
- [ ] Mobile padding is correct

**Phase 2 Complete When:**
- TierCard component renders correctly
- All states work (default, hover, highlighted, current)
- Styling matches design system
- Accessible (keyboard + screen reader)

#### Phase 3: TierSelectionModal Component (2 hours)
**Objective:** Build modal container that orchestrates tier cards

##### Task 3.1: Create Modal Container (1 hour)
Files to create:
- `apps/app/src/components/tiers/TierSelectionModal.tsx`

Actions:
- [ ] Import existing Modal component from `components/Modal.tsx`
- [ ] Create TierSelectionModal functional component
- [ ] Accept props: isOpen, onClose, onAuthRequired, onUpgradeRequired
- [ ] Get currentTier from SubscriptionContext
- [ ] Map TIER_CONFIGS to TierCard components:
  - [ ] Determine if each tier is current (id matches currentTier mapping)
  - [ ] Pass isCurrentTier prop to TierCard
  - [ ] Handle onClick for each card
- [ ] Implement handleTierSelect function:
  ```typescript
  const handleTierSelect = (config: TierConfig) => {
    switch (config.ctaAction) {
      case 'close':
        onClose();
        break;
      case 'auth':
        onClose();
        onAuthRequired();
        break;
      case 'upgrade':
        onClose();
        onUpgradeRequired(config.id);
        break;
      case 'waitlist':
        onClose();
        console.log('Waitlist for:', config.id);
        break;
    }
  };
  ```
- [ ] Validate tier action before executing
- [ ] Add error logging for invalid actions

Test criteria:
- [ ] Modal opens when isOpen=true
- [ ] All 4 tier cards render
- [ ] Current tier shows "CURRENT" badge
- [ ] Clicking cards triggers correct action
- [ ] Modal closes on outside click
- [ ] ESC key closes modal

**Checkpoint:** Modal displays all tiers with correct badges

##### Task 3.2: Add Modal Styling & Accessibility (1 hour)
Files to modify:
- `apps/app/src/components/tiers/TierSelectionModal.tsx`

Actions:
- [ ] Add modal header:
  - [ ] Title: "Choose Your Plan"
  - [ ] Subtitle: "Start creating custom signals with AI"
  - [ ] Close button (X icon)
- [ ] Add modal content container:
  - [ ] Max-width: 900px (desktop)
  - [ ] Vertical stack of TierCard components
  - [ ] Gap: 16px between cards
  - [ ] Padding: 24px
  - [ ] Overflow: auto (for mobile)
- [ ] Add accessibility attributes:
  - [ ] role="dialog"
  - [ ] aria-modal="true"
  - [ ] aria-labelledby="tier-modal-title"
  - [ ] aria-describedby="tier-modal-description"
- [ ] Implement focus trap:
  - [ ] Focus first tier card on open
  - [ ] Tab cycles through cards and close button
  - [ ] Shift+Tab reverses
- [ ] Add animations:
  - [ ] Modal fade-in: 200ms ease-out
  - [ ] Modal fade-out: 150ms ease-in
  - [ ] Backdrop blur effect

Test criteria:
- [ ] Header displays correctly
- [ ] Cards stack vertically with proper spacing
- [ ] Focus trap works
- [ ] Screen reader announces modal
- [ ] Animations are smooth

**Phase 3 Complete When:**
- Modal renders all tier cards correctly
- Tier actions trigger appropriate callbacks
- Accessibility standards met (WCAG 2.1 AA)
- Animations perform at 60fps

#### Phase 4: CreateSignalButton Component (1 hour)
**Objective:** Build prominent CTA button for sidebar

##### Task 4.1: Create Button Component (45 min)
Files to create:
- `apps/app/src/components/tiers/CreateSignalButton.tsx`

Actions:
- [ ] Create functional component with CreateSignalButtonProps
- [ ] Render button with:
  - [ ] Icon: ✨ emoji or Sparkles icon from lucide-react
  - [ ] Text: "Create Signal with AI"
  - [ ] onClick handler
- [ ] Add gradient background:
  ```css
  background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%);
  ```
- [ ] Add hover effect:
  - [ ] Transform: translateY(-2px)
  - [ ] Box-shadow: 0 6px 20px rgba(99, 102, 241, 0.6)
- [ ] Add active effect:
  - [ ] Transform: scale(0.98)
- [ ] Add focus ring:
  - [ ] 3px border with var(--tm-accent)

Test criteria:
- [ ] Button renders with gradient
- [ ] Icon shows correctly
- [ ] Hover lifts button
- [ ] Click triggers onClick prop
- [ ] Focus ring visible

**Checkpoint:** Button looks like mockup and triggers onClick

##### Task 4.2: Add Button Styling (15 min)
Files to modify:
- `apps/app/src/components/tiers/CreateSignalButton.tsx`

Actions:
- [ ] Add styles:
  - [ ] Width: 100%
  - [ ] Padding: 12px 20px
  - [ ] Border-radius: var(--tm-radius-md)
  - [ ] Font-weight: 600
  - [ ] Font-size: 0.875rem
  - [ ] Color: white
  - [ ] Cursor: pointer
- [ ] Add shimmer effect (optional):
  - [ ] Keyframe animation for gradient shift
  - [ ] Subtle movement on idle

Test criteria:
- [ ] Styling matches mockup
- [ ] Gradient is smooth
- [ ] Transitions are 200ms

**Phase 4 Complete When:**
- Button component renders correctly
- Gradient background works
- Hover/active states feel responsive
- Matches design spec exactly

#### Phase 5: Sidebar Integration (1.5 hours)
**Objective:** Integrate new components into Sidebar

##### Task 5.1: Add State Management (30 min)
Files to modify:
- `apps/app/components/Sidebar.tsx`

Actions:
- [ ] Import new components:
  ```typescript
  import { CreateSignalButton } from '../src/components/tiers/CreateSignalButton';
  import { TierSelectionModal } from '../src/components/tiers/TierSelectionModal';
  ```
- [ ] Add state for tier modal:
  ```typescript
  const [showTierModal, setShowTierModal] = useState(false);
  ```
- [ ] Create handler functions:
  ```typescript
  const handleCreateSignal = () => {
    setShowTierModal(true);
  };

  const handleTierModalClose = () => {
    setShowTierModal(false);
  };

  const handleAuthRequired = () => {
    setShowTierModal(false);
    setShowAuthModal(true);
  };

  const handleUpgradeRequired = (tierId: string) => {
    setShowTierModal(false);
    console.log('Upgrade required for tier:', tierId);
    // TODO: Navigate to payment page
  };
  ```

Test criteria:
- [ ] State updates correctly
- [ ] Handlers log to console
- [ ] No TypeScript errors

**Checkpoint:** State and handlers defined without errors

##### Task 5.2: Add Components to Sidebar JSX (1 hour)
Files to modify:
- `apps/app/components/Sidebar.tsx`

Actions:
- [ ] Add CreateSignalButton at top of sidebar (after StatusBar, before TraderList):
  ```tsx
  <div className="px-4 md:px-6 mb-4">
    <CreateSignalButton onClick={handleCreateSignal} />
  </div>
  ```
- [ ] Add TierSelectionModal before closing `</aside>` tag:
  ```tsx
  <TierSelectionModal
    isOpen={showTierModal}
    onClose={handleTierModalClose}
    onAuthRequired={handleAuthRequired}
    onUpgradeRequired={handleUpgradeRequired}
  />
  ```
- [ ] Ensure modal renders above other content (z-index)
- [ ] Test that EmailAuthModal still works after tier modal closes

Test criteria:
- [ ] Button appears at top of sidebar
- [ ] Clicking button opens tier modal
- [ ] Modal displays correctly
- [ ] Clicking "Sign In to Get Started" closes tier modal and opens auth modal
- [ ] Existing auth flow works
- [ ] No layout shifts

**Phase 5 Complete When:**
- CreateSignalButton visible in sidebar
- TierSelectionModal opens on button click
- Auth flow works (tier modal → auth modal)
- No regressions in existing functionality

#### Phase 6: Create Index Export (15 min)
**Objective:** Clean exports for tier components

##### Task 6.1: Create Index File (15 min)
Files to create:
- `apps/app/src/components/tiers/index.ts`

Actions:
- [ ] Export all tier components:
  ```typescript
  export { CreateSignalButton } from './CreateSignalButton';
  export { TierSelectionModal } from './TierSelectionModal';
  export { TierCard } from './TierCard';
  export type { CreateSignalButtonProps } from './CreateSignalButton';
  export type { TierSelectionModalProps } from './TierSelectionModal';
  export type { TierCardProps } from './TierCard';
  ```

Test criteria:
- [ ] Can import from `components/tiers`
- [ ] All exports work

**Phase 6 Complete When:**
- Index file exports all components
- Imports work cleanly

#### Phase 7: Polish & Edge Cases (2 hours)
**Objective:** Handle edge cases, optimize, and polish UX

##### Task 7.1: Add Loading States (30 min)
Files to modify:
- `apps/app/src/components/tiers/TierSelectionModal.tsx`

Actions:
- [ ] Show skeleton loaders while SubscriptionContext is loading
- [ ] Add spinner or skeleton for tier cards
- [ ] Handle loading state gracefully

Test criteria:
- [ ] Loading state shows on initial render
- [ ] No flash of wrong content
- [ ] Smooth transition to loaded state

##### Task 7.2: Add Error Handling (30 min)
Files to modify:
- `apps/app/src/components/tiers/TierSelectionModal.tsx`
- `apps/app/src/components/tiers/CreateSignalButton.tsx`

Actions:
- [ ] Handle SubscriptionContext errors:
  - [ ] If context fails, assume anonymous tier
  - [ ] Log error to console
  - [ ] Don't block modal from opening
- [ ] Validate tier actions:
  - [ ] Check action is in VALID_ACTIONS
  - [ ] Check tier ID exists in TIER_CONFIGS
  - [ ] Log invalid attempts
- [ ] Add error boundary (optional):
  - [ ] Catch render errors
  - [ ] Show fallback UI

Test criteria:
- [ ] Modal works even if context fails
- [ ] Invalid tier actions are logged
- [ ] No unhandled exceptions

##### Task 7.3: Optimize Performance (30 min)
Files to modify:
- `apps/app/src/components/tiers/TierCard.tsx`
- `apps/app/src/components/tiers/TierSelectionModal.tsx`

Actions:
- [ ] Memoize TierCard component:
  ```typescript
  export const TierCard = React.memo(TierCardComponent);
  ```
- [ ] Memoize tier card rendering in modal
- [ ] Use useCallback for event handlers
- [ ] Profile modal open time (should be <100ms)

Test criteria:
- [ ] Modal opens in <100ms
- [ ] No unnecessary re-renders
- [ ] Smooth 60fps animations

##### Task 7.4: Mobile Responsiveness (30 min)
Files to modify:
- `apps/app/src/components/tiers/TierSelectionModal.tsx`
- `apps/app/src/components/tiers/TierCard.tsx`

Actions:
- [ ] Add responsive breakpoints:
  - [ ] Desktop (>1024px): Normal layout
  - [ ] Tablet (768-1024px): Full-width cards
  - [ ] Mobile (<768px): Bottom sheet style, condensed cards
- [ ] Test on different screen sizes
- [ ] Ensure touch targets are 44px minimum
- [ ] Test scroll behavior on mobile

Test criteria:
- [ ] Works on mobile (iPhone SE size)
- [ ] Works on tablet (iPad size)
- [ ] Touch targets are easy to tap
- [ ] Modal doesn't overflow

**Phase 7 Complete When:**
- All edge cases handled
- Performance optimized (<100ms modal open)
- Mobile experience is smooth
- No console errors or warnings

### Testing Strategy

#### Commands to Run After Each Task
```bash
# Type checking
pnpm typecheck

# Build to catch errors
pnpm build

# Run in development mode
pnpm dev

# Test in browser
# Open http://localhost:5173
# Click "Create Signal with AI" button
# Verify tier modal opens
```

#### Manual Testing Checklist

**Desktop Testing:**
- [ ] Button appears at top of sidebar
- [ ] Button has gradient background
- [ ] Clicking button opens modal
- [ ] Modal shows all 4 tier cards
- [ ] Anonymous user sees no "CURRENT" badge
- [ ] Free tier user sees "CURRENT" badge on Starter card
- [ ] Clicking "Continue as Guest" closes modal
- [ ] Clicking "Sign In to Get Started" opens auth modal
- [ ] Clicking "Upgrade to Lite" logs to console (payment not implemented)
- [ ] Clicking "Join Waitlist" logs to console (waitlist not implemented)
- [ ] ESC key closes modal
- [ ] Clicking outside modal closes it
- [ ] Modal animations are smooth

**Mobile Testing:**
- [ ] Button is full-width
- [ ] Modal slides up from bottom
- [ ] Cards are condensed
- [ ] Scroll works on long feature lists
- [ ] Touch targets are easy to tap
- [ ] Close button is accessible

**Accessibility Testing:**
- [ ] Tab key navigates through cards
- [ ] Shift+Tab reverses navigation
- [ ] Focus ring is visible
- [ ] Screen reader announces modal
- [ ] Screen reader reads tier names and features
- [ ] Keyboard can activate all buttons

**Edge Cases:**
- [ ] SubscriptionContext loading state
- [ ] SubscriptionContext error state
- [ ] Invalid tier action (should log error)
- [ ] Rapid clicking doesn't break state
- [ ] Multiple modals don't conflict

#### Performance Testing
```bash
# Profile in browser DevTools
# 1. Open Performance tab
# 2. Click "Create Signal with AI"
# 3. Stop recording
# 4. Verify modal open <100ms
# 5. Check for layout thrashing
# 6. Verify 60fps animations
```

### Rollback Plan
If issues arise:
1. `git stash` current changes
2. `git checkout main`
3. Document blockers in issue comments
4. Notify PM of delays
5. Create rollback PR if needed

### PM Checkpoints
Review points for PM validation:
- [ ] **After Phase 0** - Mockup approved (REQUIRED before Phase 1)
- [ ] **After Phase 2** - TierCard component looks correct
- [ ] **After Phase 3** - Modal flow works smoothly
- [ ] **After Phase 5** - Integration in sidebar is clean
- [ ] **After Phase 7** - Final polish approved

### Success Metrics
Implementation is complete when:
- [ ] All TypeScript compiles with 0 errors
- [ ] `pnpm build` succeeds
- [ ] Modal opens in <100ms (measured)
- [ ] All 4 tier cards render correctly
- [ ] Anonymous → Starter auth flow works
- [ ] Mobile responsive (tested on iPhone SE)
- [ ] Accessibility WCAG 2.1 AA compliant
- [ ] No console errors or warnings
- [ ] PM has approved final implementation

### Risk Tracking

| Phase | Risk | Mitigation | Status |
|-------|------|------------|--------|
| 0 | Design doesn't match PM vision | Get approval before coding | ⏳ |
| 2 | TierCard styling inconsistent | Reference trademind-design-system.css | ⏳ |
| 3 | Modal state conflicts with auth modal | Test modal coordination | ⏳ |
| 5 | Sidebar layout breaks | Add CSS carefully, test responsive | ⏳ |
| 7 | Performance degradation | Profile and optimize early | ⏳ |

### Time Estimates
- **Phase 0**: 2-3 hours (Mockup + PM approval)
- **Phase 1**: 1 hour (Config + types)
- **Phase 2**: 2 hours (TierCard)
- **Phase 3**: 2 hours (Modal)
- **Phase 4**: 1 hour (Button)
- **Phase 5**: 1.5 hours (Integration)
- **Phase 6**: 15 min (Exports)
- **Phase 7**: 2 hours (Polish)
- **Total: 11.75-12.75 hours**

### Next Actions
1. **Create feature branch**: `git checkout -b feature/tier-selection-modal`
2. **Start Phase 0**: Create HTML/CSS mockup
3. **Get PM approval** on mockup before proceeding
4. **Begin Phase 1**: Create tier configuration
5. **Test after each phase**: Run `pnpm build && pnpm typecheck`

---

## Implementation Progress
*Stage: implementing | Date: 2025-10-06*

### Phase 0: Interactive Mockup ✅
- **Started:** 2025-10-06
- **Completed:** 2025-10-06
- **Duration:** ~1.5 hours (est: 2-3 hours)
- **Status:** Mockup complete, awaiting PM approval

**Files Created:**
- `mockups/tier-selection-modal.html` - Interactive HTML mockup
- `mockups/tier-modal-styles.css` - TradeMind design system styling
- `mockups/tier-modal-script.js` - Interactive behavior

**Features Implemented:**
- ✅ All 4 tier cards (Guest, Starter, Lite, Pro)
- ✅ Gradient "Create Signal with AI" button
- ✅ Badge system (current, popular, recommended, locked)
- ✅ Modal open/close interactions
- ✅ ESC key and click-outside-to-close
- ✅ Keyboard navigation (Tab, Enter, Space)
- ✅ Mobile responsive (<768px bottom sheet)
- ✅ Loading state with skeleton loaders
- ✅ User state toggle (anonymous vs free tier)
- ✅ Console logging for all actions

**Testing:**
- ✅ Desktop layout displays correctly
- ✅ Mobile layout slides up from bottom
- ✅ All tier CTAs log correct actions
- ✅ Badge visibility toggles based on user state
- ✅ Hover effects and transitions work smoothly
- ✅ Accessibility features (focus states, keyboard nav)

**Notes:**
- Mockup demonstrates all key user flows
- TradeMind design system colors applied correctly
- Interactive JS allows testing of all user states
- Test controls allow switching between anonymous/free tier views
- Ready for PM review and approval

**⚠️ WAITING FOR PM APPROVAL BEFORE PROCEEDING TO PHASE 1**

---

*[End of plan. Next: /implement issues/2025-10-06-tier-selection-modal.md]*
