# Tier Structure & Pricing Model

**Status:** Proposed Architecture
**Last Updated:** 2025-10-10
**Decision:** Hybrid pricing (Subscription + Usage Credits)

---

## Executive Summary

This document outlines a sophisticated 5-tier system with hybrid pricing:
- **Free tiers** (no login + login) for growth funnel
- **Paid tiers** (Lite/Pro/Elite) with included analysis credits
- **Model selection** (Quick/Standard/Deep) tied to trading strategy
- **Credits system** for AI analysis consumption

**Key Innovation:** Users control cost/quality tradeoff by choosing analysis model based on trading timeframe.

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Complete Tier Structure](#complete-tier-structure)
3. [Model Selection System](#model-selection-system)
4. [Credits System](#credits-system)
5. [UX Solutions](#ux-solutions)
6. [Technical Implementation](#technical-implementation)
7. [Implementation Roadmap](#implementation-roadmap)

---

## Core Concepts

### The "Trader" Concept

Everything revolves around **Traders** - AI agents with personality that:
1. **Detect** setups matching criteria (filter code execution)
2. **Analyze** opportunities with AI (personality-driven prompts)
3. **Execute** trades automatically (Elite tier only)

### Why "Trader" with Personality?

**Traders are agents with characteristics**, not just filters. This enables:

- **Consistent AI behavior**: Same trader = same decision-making style
- **User connection**: Users bond with "their trader"
- **Better prompts**: Personality = context = better LLM outputs
- **Differentiation**: Each trader has unique characteristics

**Example Trader Personality:**
```typescript
{
  name: "The Patient Divergence Trader",
  personality: {
    style: "conservative",
    riskTolerance: "medium",
    patience: "high",
    philosophy: "I only trade high-probability setups",
    decisionMaking: "I wait for multiple confirmations"
  }
}
```

**AI Analysis with Personality:**
```
💭 "I see RSI divergence forming, but I want to see one more
   confirming candle before I'd consider this a high-confidence
   entry. Volume is good but not exceptional. I'm staying patient."
```

### Three-Tier Capability Model

| Capability | Free | Lite/Pro | Elite |
|------------|------|----------|-------|
| **Detection** | ✅ Pre-built only | ✅ Custom | ✅ Custom |
| **AI Analysis** | ❌ | ✅ Credit-based | ✅ Credit-based |
| **Trade Execution** | ❌ | ❌ (Pro only) | ✅ |

---

## Complete Tier Structure

### Observer (Free - No Login)

**Target:** Curious visitors, first-time users
**Price:** Free
**Monthly Credits:** None

#### Features
✅ View 5 pre-built traders with live matches
✅ See paper trading history & performance
✅ Real-time market data
✅ Basic charting

#### Limitations
❌ No AI analysis of setups
❌ No notifications
❌ No favorites
❌ Can't create custom traders

**Value Proposition:** "See what AI trading looks like"

---

### Observer (Free - With Login)

**Target:** Engaged users not ready to pay
**Price:** Free
**Monthly Credits:** None

#### Features
✅ Everything in Observer (no login)
✅ Sound notifications (in-app only)
✅ Favorite traders
✅ Match history (last 7 days)

#### Limitations
❌ No AI analysis
❌ No custom traders

**Value Proposition:** "Stay informed without paying"

---

### Strategist Lite ($49/mo)

**Target:** Hobbyists testing custom strategies
**Price:** $49/month
**Monthly Credits:** $10 (~330 standard analyses)

#### Features
✅ Everything in Observer (login)
✅ Create up to 3 custom traders
✅ AI analysis on every match
✅ Email + Telegram notifications
✅ 30-day match history
✅ Advanced charting
✅ Choose analysis model (Quick/Standard/Deep)
✅ Can purchase additional credits

#### Limitations
❌ No trade execution
❌ No Level 2 data

**Value Proposition:** "Test your trading ideas with AI"

---

### Strategist Pro ($99/mo)

**Target:** Serious traders wanting automation
**Price:** $99/month
**Monthly Credits:** $30 (~1,000 standard analyses)

#### Features
✅ Everything in Strategist Lite
✅ Create up to 10 custom traders
✅ **Automated trade execution**
  - Connect Binance / Bybit / Hyperliquid
  - Risk management controls
  - Position sizing automation
✅ Level 2 order book data
✅ Unlimited match history
✅ Paper trading mode
✅ Can purchase additional credits

#### Limitations
❌ No WebSocket API access

**Value Proposition:** "Automate your trading 24/7"

---

### Strategist Elite ($249/mo)

**Target:** Power users, algorithmic traders, teams
**Price:** $249/month
**Monthly Credits:** $75 (~2,500 standard analyses)

#### Features
✅ Everything in Strategist Pro
✅ Create up to 25 custom traders
✅ **WebSocket API access**
  - Real-time data streaming
  - Custom integrations
  - Programmatic trader management
✅ Priority support (24-hour response)
✅ Advanced portfolio management
✅ Multi-exchange position management
✅ Can purchase additional credits

**Value Proposition:** "Build your trading empire"

---

### Add-Ons (All Paid Tiers)

**Additional Analysis Credits:**
- $10 pack → ~330 standard analyses
- $25 pack → ~830 standard analyses
- $50 pack → ~1,660 standard analyses
- $100 pack → ~3,300 standard analyses

---

## Model Selection System

### Why Model Selection Matters

Different trading styles need different analysis speeds:
- **Scalpers**: Need speed (1-15 min trades) → Quick model
- **Swing traders**: Need balance (hours-days) → Standard model
- **Position traders**: Need depth (days-weeks) → Deep model

### The Three Models

| Model | Speed | Cost | Best For | Backend |
|-------|-------|------|----------|---------|
| ⚡ **Quick Analysis** | 2-3 sec | ~$0.004 | Scalping, fast entries | Claude 3 Haiku |
| ⚙️ **Standard Analysis** | 5-8 sec | ~$0.030 | Swing trading | Claude 3.5 Sonnet |
| 🔬 **Deep Analysis** | 15-30 sec | ~$0.150 | Position trading | Claude 3.5 Opus |

### Model Pricing Breakdown

**OpenRouter Estimated Costs:**
- Quick (Haiku): ~$0.0025 per 1K tokens
- Standard (Sonnet): ~$0.015 per 1K tokens
- Deep (Opus): ~$0.075 per 1K tokens

**Typical analysis prompt + response:** ~2K tokens

**Cost per analysis:**
- Quick: $0.004
- Standard: $0.030
- Deep: $0.150

**What $10 buys:**
- Quick: ~2,500 analyses
- Standard: ~333 analyses
- Deep: ~66 analyses

### Smart Model Recommendations

When user creates a trader, AI analyzes the strategy description and recommends appropriate model:

**Example:**
```
User input: "Buy RSI oversold on 5m chart"

AI detects: "5m chart" = short timeframe
Recommendation: ⚡ Quick Analysis

Reasoning shown to user:
"Your strategy uses 5-minute charts, which suggests
scalping. We recommend Quick Analysis for faster
decisions and lower cost. You can change this anytime."
```

### Model Selection UX

During trader creation:

```
┌─────────────────────────────────────┐
│  Configure Analysis Model           │
│                                     │
│  Based on your strategy ("scalp RSI │
│  oversold"), we recommend:          │
│                                     │
│  ⚡ Quick Analysis ✓ Recommended    │
│  Response time: 2-3 seconds         │
│  Best for: Scalping, fast entries   │
│  Cost: ~$0.004 per analysis         │
│                                     │
│  ⚙️ Standard Analysis               │
│  Response time: 5-8 seconds         │
│  Best for: Swing trading            │
│  Cost: ~$0.030 per analysis         │
│                                     │
│  🔬 Deep Analysis                   │
│  Response time: 15-30 seconds       │
│  Best for: Position trading         │
│  Cost: ~$0.150 per analysis         │
│                                     │
│  [Confirm]                          │
└─────────────────────────────────────┘
```

---

## Credits System

### Core Principle: Don't Call Them "Credits"

**Bad UX:** "$10 in credits remaining"
**Good UX:** "327 analyses remaining (Standard mode)"

Users don't care about abstract "credits" - they care about **what they can do**.

### Credit Balance Display

```
┌───────────────────────────────────┐
│  💎 Analysis Balance              │
│                                   │
│  327 analyses remaining           │
│  (Based on Standard mode)         │
│                                   │
│  Refills in 23 days               │
│                                   │
│  [Add More]  [View Usage]         │
└───────────────────────────────────┘
```

### Multi-Model Balance View

```
┌─────────────────────────────────────┐
│  Your Analysis Balance              │
│                                     │
│  Quick Mode:    ~2,340 remaining    │
│  Standard Mode: ~310 remaining      │
│  Deep Mode:     ~62 remaining       │
│                                     │
│  [Add More Analyses]                │
└─────────────────────────────────────┘
```

### Per-Trader Cost Tracking

```
┌───────────────────────────────────┐
│  🤖 The Divergence Hunter         │
│  Status: Active 🟢                │
│  Model: ⚙️ Standard Analysis      │
│  Cost: ~$0.03 per analysis        │
│                                   │
│  Today: 5 matches, 5 analyses     │
│  This month: 47 matches           │
│  Credits used: $1.41              │
│                                   │
│  [Settings]  [View Matches]       │
└───────────────────────────────────┘
```

### What Happens When Credits Run Out?

**❌ Bad UX:**
- Analysis just stops (user confusion)
- Trader stops working (missed opportunities)

**✅ Good UX:**
1. Warnings at 20%, 10%, 5% remaining
2. When depleted: Trader switches to "detection only" mode
3. Prominent prompt to add credits
4. One-click credit purchase

**Trader State Machine:**
```typescript
enum TraderState {
  ACTIVE = 'active',           // Has credits, analyzing
  DETECTING_ONLY = 'detecting', // No credits, detection only
  PAUSED = 'paused'            // User paused
}
```

**When credits depleted:**
```
┌───────────────────────────────────┐
│  🔴 Analysis credits depleted      │
│                                   │
│  Your traders are still detecting │
│  setups, but AI analysis is       │
│  paused until you add credits.    │
│                                   │
│  [Add $10] [Add $25] [Add $50]    │
└───────────────────────────────────┘
```

### Low Balance Warnings

**At 20% remaining:**
```
┌───────────────────────────────────┐
│  ⚠️ Analysis balance running low   │
│                                   │
│  You have ~65 analyses remaining  │
│  (about 3 days at current usage)  │
│                                   │
│  [Add Credits]  [Remind Me Later] │
└───────────────────────────────────┘
```

### Usage Analytics

```
┌─────────────────────────────────────────┐
│  📊 Analysis Usage (Last 30 Days)       │
├─────────────────────────────────────────┤
│                                         │
│  Total Analyses: 287                    │
│  Total Cost: $8.61                      │
│  Average per day: 9.6 analyses          │
│                                         │
│  By Model:                              │
│  ⚡ Quick: 120 analyses ($0.48)         │
│  ⚙️ Standard: 150 analyses ($4.50)     │
│  🔬 Deep: 17 analyses ($2.55)          │
│                                         │
│  By Trader:                             │
│  🤖 Divergence Hunter: 98 ($2.94)      │
│  🤖 Breakout Trader: 75 ($2.25)        │
│  🤖 Volume Spike: 114 ($3.42)          │
│                                         │
│  Projected monthly cost: ~$8.61        │
│  Credits remaining: $1.39              │
│                                         │
│  [Add Credits]  [Download Report]      │
└─────────────────────────────────────────┘
```

---

## UX Solutions

### Key UX Principles

1. **Transparency**: Always show cost per analysis
2. **Warnings**: Alert at 20%, 10%, 5% remaining
3. **Graceful Degradation**: Detection continues when credits depleted
4. **Easy Top-up**: One-click credit purchase
5. **Usage Insights**: Show what's consuming credits

### Critical UX Decisions

#### Don't Use "Credits" in User-Facing Copy

| ❌ Bad | ✅ Good |
|--------|---------|
| "Credits remaining" | "Analyses remaining" |
| "Buy credits" | "Add more analyses" |
| "$10 in credits" | "~330 analyses (Standard mode)" |
| "Credit balance" | "Analysis balance" |

#### Show Value, Not Just Cost

| ❌ Bad | ✅ Good |
|--------|---------|
| "$10 = 1M tokens" | "$10 = ~330 analyses" |
| "0.015¢ per 1K tokens" | "~$0.03 per analysis" |
| "GPT-4 pricing" | "Standard Analysis" |

#### Make Model Selection Strategic

| ❌ Bad | ✅ Good |
|--------|---------|
| "Fast/Standard/Slow" | "Quick/Standard/Deep Analysis" |
| "Cheap/Normal/Expensive" | "Best for: Scalping/Swing/Position" |
| No guidance | AI recommends based on strategy |

---

## Technical Implementation

### Database Schema

```typescript
// traders table
interface Trader {
  id: string;
  userId: string;
  name: string;
  description: string;
  avatar?: string;

  // Personality (for prompt engineering)
  personality: {
    style: 'conservative' | 'aggressive' | 'balanced' | 'scalper';
    riskTolerance: 'low' | 'medium' | 'high';
    patience: 'high' | 'medium' | 'low';
    philosophy: string;
    decisionMaking: string;
  };

  // Strategy
  strategy: {
    description: string;
    filter: {
      code: string;
      indicators: IndicatorConfig[];
      timeframes: string[];
    };
  };

  // Mode (tier-gated)
  mode: 'watch' | 'analyze' | 'trade';

  // Model selection
  analysisModel: 'quick' | 'standard' | 'deep';

  // Trading config (only if mode='trade')
  trading?: {
    entryRules: string;
    exitStrategy: string;
    positionSizing: PositionConfig;
    riskManagement: RiskConfig;
  };

  status: 'active' | 'detecting_only' | 'paused';
  stats: {
    matchesFound: number;
    analysesPerformed: number;
    tradesExecuted?: number;
    winRate?: number;
    pnl?: number;
  };
}

// users table additions
interface User {
  // ... existing fields
  tier: 'observer' | 'lite' | 'pro' | 'elite';
  analysisCreditsUsd: number;  // Track in USD, not tokens
  creditRefillDate: Date;
}

// usage_tracking table
interface UsageRecord {
  id: string;
  userId: string;
  traderId: string;
  model: 'quick' | 'standard' | 'deep';
  tokensUsed: number;
  costUsd: number;
  timestamp: Date;
}
```

### OpenRouter Integration

```typescript
import Anthropic from '@anthropic-ai/sdk';

// Model configuration
const ANALYSIS_MODELS = {
  quick: {
    id: 'anthropic/claude-3-haiku',
    avgCostPer1kTokens: 0.0025,
    avgResponseTime: 2000  // 2 sec
  },
  standard: {
    id: 'anthropic/claude-3-5-sonnet',
    avgCostPer1kTokens: 0.015,
    avgResponseTime: 5000  // 5 sec
  },
  deep: {
    id: 'anthropic/claude-3-5-opus',
    avgCostPer1kTokens: 0.075,
    avgResponseTime: 20000  // 20 sec
  }
};

// Main analysis function with tracking
async function analyzeSetupWithTracking(
  traderId: string,
  marketData: MarketData,
  model: 'quick' | 'standard' | 'deep'
) {
  const trader = await getTrader(traderId);
  const user = await getUser(trader.userId);

  // Check balance
  if (user.analysisCreditsUsd <= 0) {
    // Switch trader to detection-only mode
    await updateTrader(traderId, { status: 'detecting_only' });

    return {
      success: false,
      reason: 'insufficient_credits',
      fallback: 'detection_only'
    };
  }

  // Build prompt with personality
  const prompt = buildAnalysisPrompt(trader, marketData);

  // Call OpenRouter
  const response = await callOpenRouter({
    model: ANALYSIS_MODELS[model].id,
    prompt
  });

  // Calculate actual cost
  const costUsd = calculateCost(
    response.usage.total_tokens,
    model
  );

  // Track usage
  await trackUsage({
    userId: user.id,
    traderId,
    model,
    tokensUsed: response.usage.total_tokens,
    costUsd
  });

  // Deduct from balance
  await deductCredits(user.id, costUsd);

  // Check if balance is low and send warning
  if (user.analysisCreditsUsd <= getWarningThreshold(user.tier)) {
    await sendLowBalanceWarning(user.id);
  }

  return {
    success: true,
    analysis: response.analysis,
    costUsd,
    creditsRemaining: user.analysisCreditsUsd - costUsd
  };
}

// Build prompt with personality context
function buildAnalysisPrompt(
  trader: Trader,
  marketData: MarketData
): string {
  return `
You are "${trader.name}", a ${trader.personality.style} cryptocurrency trader.

YOUR PERSONALITY:
- Risk tolerance: ${trader.personality.riskTolerance}
- Patience level: ${trader.personality.patience}
- Trading philosophy: "${trader.personality.philosophy}"
- Decision making: "${trader.personality.decisionMaking}"

YOUR STRATEGY:
${trader.strategy.description}

CURRENT SITUATION:
A potential setup has been detected on ${marketData.symbol}.

Market Data:
${JSON.stringify(marketData, null, 2)}

TASK:
Analyze this setup through YOUR lens as ${trader.name}.
- Would YOU take this trade based on YOUR personality and strategy?
- Explain your thinking in first-person
- Be consistent with your risk tolerance and patience level
- Provide your confidence level (0-100%)

Format your response as if you're explaining your decision to the user.
  `.trim();
}
```

### Polar.sh Integration

```typescript
import { Polar } from '@polar-sh/sdk';

const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN
});

// Credit pack pricing
const CREDIT_PACK_PRICES = {
  10: 'price_xxx',   // $10 pack
  25: 'price_yyy',   // $25 pack
  50: 'price_zzz',   // $50 pack
  100: 'price_aaa'   // $100 pack
};

// Handle credit purchase
async function purchaseCreditPack(
  userId: string,
  packSize: 10 | 25 | 50 | 100
) {
  const checkout = await polar.checkouts.create({
    productPriceId: CREDIT_PACK_PRICES[packSize],
    customerId: userId,
    successUrl: `${BASE_URL}/credits/success`,
    cancelUrl: `${BASE_URL}/credits`,
    metadata: {
      type: 'credit_pack',
      amount: packSize
    }
  });

  return checkout.url;
}

// Webhook handler for successful purchase
async function handlePolarWebhook(event: PolarWebhookEvent) {
  if (event.type === 'checkout.completed') {
    const { customerId, metadata } = event.data;

    if (metadata.type === 'credit_pack') {
      await addCredits(customerId, metadata.amount);

      // Reactivate any traders in detecting_only mode
      await reactivateTradersForUser(customerId);
    }
  }
}

// Monthly refill logic (cron job)
async function refillMonthlyCredits() {
  const usersNeedingRefill = await getUsersWithRefillDue();

  for (const user of usersNeedingRefill) {
    const refillAmount = {
      lite: 10,
      pro: 30,
      elite: 75
    }[user.tier];

    await addCredits(user.id, refillAmount);
    await updateRefillDate(user.id, addMonths(new Date(), 1));
  }
}
```

### Tier Enforcement

```typescript
// Tier capability checking
const TIER_LIMITS = {
  observer: {
    customTradersMax: 0,
    canAnalyze: false,
    canTrade: false,
    canUseAPI: false
  },
  lite: {
    customTradersMax: 3,
    canAnalyze: true,
    canTrade: false,
    canUseAPI: false
  },
  pro: {
    customTradersMax: 10,
    canAnalyze: true,
    canTrade: true,
    canUseAPI: false
  },
  elite: {
    customTradersMax: 25,
    canAnalyze: true,
    canTrade: true,
    canUseAPI: true
  }
};

// Check if user can create trader
async function canCreateTrader(userId: string): Promise<boolean> {
  const user = await getUser(userId);
  const existingTradersCount = await countUserTraders(userId);

  return existingTradersCount < TIER_LIMITS[user.tier].customTradersMax;
}

// Check if user can enable feature
function canUseFeature(
  userTier: Tier,
  feature: 'analyze' | 'trade' | 'api'
): boolean {
  switch (feature) {
    case 'analyze':
      return TIER_LIMITS[userTier].canAnalyze;
    case 'trade':
      return TIER_LIMITS[userTier].canTrade;
    case 'api':
      return TIER_LIMITS[userTier].canUseAPI;
  }
}
```

---

## Implementation Roadmap

### Phase 1: Core Tiers (2 weeks)

**Goal:** Basic tier system without credits

- [ ] Implement Observer (free, no login) tier
- [ ] Implement Observer (free, with login) tier
- [ ] Add tier checking logic to database
- [ ] Create 5 pre-built traders with paper trading history
- [ ] Build tier enforcement middleware
- [ ] Add basic pricing page

**Deliverable:** Users can view pre-built traders, login for favorites/notifications

---

### Phase 2: Credits System (2 weeks)

**Goal:** Credits tracking and display

- [ ] OpenRouter integration
- [ ] Credits tracking database schema
- [ ] Usage analytics dashboard
- [ ] Balance warnings system
- [ ] Low balance notification system
- [ ] Credit purchase flow (Polar.sh)
- [ ] Monthly refill cron job

**Deliverable:** Credits system fully functional, users can see usage

---

### Phase 3: Strategist Lite (2 weeks)

**Goal:** Custom trader creation with AI analysis

- [ ] Custom trader creation flow
- [ ] AI analysis integration with personality prompts
- [ ] Email/Telegram notification system
- [ ] Model selection UI
- [ ] Smart model recommendations (AI-powered)
- [ ] Per-trader cost tracking
- [ ] 30-day match history

**Deliverable:** Users can create custom traders with AI analysis

---

### Phase 4: Strategist Pro (3 weeks)

**Goal:** Automated trading execution

- [ ] Exchange API integration (Binance first)
- [ ] Trade execution engine
- [ ] Risk management system
- [ ] Position sizing automation
- [ ] Level 2 data integration
- [ ] Paper trading mode
- [ ] Emergency stop/pause controls
- [ ] Trade history and performance tracking

**Deliverable:** Users can automate trading on Binance

---

### Phase 5: Strategist Elite (2 weeks)

**Goal:** API access and advanced features

- [ ] WebSocket API design and implementation
- [ ] API authentication and rate limiting
- [ ] Advanced portfolio management
- [ ] Multi-exchange position aggregation
- [ ] Bybit integration
- [ ] Hyperliquid integration
- [ ] Priority support system

**Deliverable:** Power users can integrate programmatically

---

### Phase 6: Polish & Optimization (Ongoing)

- [ ] Performance optimization
- [ ] Cost optimization (prompt engineering)
- [ ] UX improvements based on user feedback
- [ ] Additional pre-built traders
- [ ] Mobile app (future)
- [ ] Team features (future)

---

## Key Decisions Log

### Decision 1: Why "Trader" instead of "Signal"?

**Rationale:** Traders have personality, which enables better prompt engineering. A trader is an agent with characteristics, while a signal is just an event. This allows for:
- Consistent AI behavior
- User emotional connection
- Richer context for LLM prompts
- Multiple traders with different personalities

**Status:** ✅ Approved

---

### Decision 2: Why Hybrid Pricing?

**Rationale:** Aligns cost with value consumed. Heavy users pay more, light users pay less. This is fair and scalable. Subscription covers platform access, credits cover actual compute costs.

**Status:** ✅ Approved

---

### Decision 3: Why Model Selection?

**Rationale:** Different trading styles need different analysis speeds. Scalpers can't wait 20 seconds for analysis. Position traders don't mind. This gives users control over cost/quality tradeoff while making it strategically relevant.

**Status:** ✅ Approved

---

### Decision 4: Why Two Free Tiers?

**Rationale:** No-login tier reduces friction for first-time visitors. Login tier captures commitment signal while still being free. This creates a growth funnel: visitor → logged-in user → paying customer.

**Status:** ✅ Approved

---

## Open Questions

### Q1: Should Free Users See AI Analysis Results?

**Options:**
- A: Show full analysis for pre-built traders (builds trust)
- B: Show redacted analysis (teaser)
- C: Don't show analysis at all

**Recommendation:** Option A - Show full analysis for pre-built traders. This builds trust and shows value before asking for payment.

---

### Q2: Should Credits Roll Over Month-to-Month?

**Options:**
- A: Use-it-or-lose-it (expires monthly)
- B: Roll over unused credits
- C: Roll over with cap (e.g., max 2x monthly allowance)

**Recommendation:** Option C - Roll over with cap. Rewards consistent users, prevents abuse.

---

### Q3: Should There Be a Free Trial Period?

**Options:**
- A: 7-day free trial of Lite tier
- B: One-time $5 credit gift on signup
- C: No trial, free tier is sufficient

**Recommendation:** Option B - Give $5 credits on first paid tier purchase. More flexible than time-bound trial.

---

## Success Metrics

### Tier Conversion Rates
- **Target:** 5% free → Lite conversion
- **Target:** 30% Lite → Pro conversion
- **Target:** 15% Pro → Elite conversion

### Credits Usage
- **Target:** 70% of users consume all monthly credits (indicates value)
- **Target:** 20% of users purchase additional credits (indicates power users)

### Trader Creation
- **Target:** Average 2.5 custom traders per Lite user
- **Target:** Average 5 custom traders per Pro user
- **Target:** Average 12 custom traders per Elite user

### Retention
- **Target:** 80% MoM retention for Pro tier
- **Target:** 85% MoM retention for Elite tier

---

## FAQ for Implementation Team

**Q: What if OpenRouter pricing changes?**
A: We buffer 20% margin in our credit pricing. Monitor costs weekly and adjust credit packages if needed.

**Q: How do we prevent credit abuse?**
A: Rate limiting per trader (max 100 analyses per day), IP-based abuse detection, require payment method on file for credit purchases.

**Q: What happens to credits when user downgrades tier?**
A: Credits remain, but monthly refill adjusts to new tier. Unused credits never expire (unless account closed).

**Q: Can users gift credits to other users?**
A: Not in MVP. Consider for future feature.

**Q: Should we offer yearly plans?**
A: Yes, with 2-month discount (16% savings). Add after MVP validation.

---

## Appendix: Comparison to Competitors

| Feature | Our App | TradingView | 3Commas |
|---------|---------|-------------|---------|
| Custom AI traders | ✅ | ❌ | ❌ |
| AI personality | ✅ | ❌ | ❌ |
| Usage-based pricing | ✅ | ❌ | ❌ |
| Model selection | ✅ | ❌ | ❌ |
| Free tier | ✅ | ✅ | ❌ |
| Trade execution | ✅ | ❌ | ✅ |
| Multi-exchange | ✅ (Pro+) | ❌ | ✅ |
| Paper trading | ✅ | ✅ | ✅ |

**Key Differentiators:**
1. AI personality-driven traders (unique)
2. Usage-based credits (fair pricing)
3. Model selection tied to strategy (user control)
4. Two-stage free tier (growth funnel)

---

## References

- [OpenRouter Pricing](https://openrouter.ai/docs/pricing)
- [Polar.sh Documentation](https://docs.polar.sh)
- [Claude API Pricing](https://www.anthropic.com/pricing)
- [TradingView Plans](https://www.tradingview.com/gopro/)
- [3Commas Pricing](https://3commas.io/pricing)

---

**Document Version:** 1.0
**Last Updated:** 2025-10-10
**Next Review:** After MVP user testing
