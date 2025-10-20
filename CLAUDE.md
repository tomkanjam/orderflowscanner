# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AI-powered cryptocurrency screener for Binance Spot markets that allows users to describe technical trading conditions in natural language. The application uses Firebase AI Logic with Google's Gemini models to convert natural language into executable screening filters and visualizes results with real-time charts. Top-tier users get access to fully automated AI trading with the use of LLM APIs.

## Development Environment
Use pnpm

## Workflow
- Break down tasks into testable sub-tasks
- As you complete each sub-task, run pnpm build to catch errors, and test the new functionality either programatically or by asking the PM to test it before moving on.
- Don't start the server. The user runs and restarts the server.

## Debugging
If you run into errors, lean towards debugging first before implementing big fixes/changes
Always includes timestamps in your logging
Do autonomous debugging. Check logs, create testing enpoints, and use the debugger

## Architecture Overview

### Server-Side Execution Architecture
As of 2025-09-28, the application uses **server-side execution** for all trader logic:
- **Edge Functions**: All trader execution happens in Supabase Edge Functions
- **No Client Workers**: Trader logic no longer runs in browser Web Workers
- **Real-time Streaming**: Signals stream from server to client via Supabase Realtime
- **Centralized Data**: Redis stores all kline data on the server

### Service Layer
- **binanceService.ts**: Manages all Binance API interactions including WebSocket connections for real-time data
- **geminiService.ts**: Handles AI integration for generating filters and analysis using Firebase AI Logic
- **serverExecutionService.ts**: Manages real-time signal subscriptions from server
- **config/firebase.ts**: Firebase configuration and AI service initialization

### Data Flow
1. Server-side collector fetches market data and stores in Redis
2. Edge functions execute trader logic on candle boundaries
3. Signals stream to clients via Supabase Realtime channels
4. Frontend displays signals in real-time with charts (using indicatorWorker for visualization only)

### Key Technical Patterns
- **State Management**: Uses React state with Map structures for O(1) lookups
- **Server Execution**: All trader logic runs server-side in Edge Functions
- **Real-time Signals**: Supabase Realtime channels for server-to-client streaming
- **AI Integration**: Firebase AI Logic with secure server-side API key management
- **Prompt Processing**: Structured prompts with JSON schema validation and retry logic
- **Technical Analysis**: Comprehensive helper functions in `screenerHelpers.ts` for indicators (MA, RSI, MACD, etc.)

### Component Structure
- **App.tsx**: Main orchestrator managing global state and data flow
- **Components**: Modular UI components in `/components` directory
- **Types**: All TypeScript interfaces defined in `types.ts`

## Important Considerations

### When Adding Features
- All technical indicators should be added to `screenerHelpers.ts` to be accessible by AI-generated code
- Maintain the separation between data fetching (services) and UI (components)
- Follow existing TypeScript patterns with strict mode enabled

### API Limitations
- Binance API has rate limits - current implementation fetches top 100 pairs
- Firebase AI Logic handles Gemini API authentication securely
- WebSocket connections may disconnect and need reconnection logic

### Security Notes
- API keys are managed securely through Firebase AI Logic - never exposed in frontend code
- Firebase configuration is safe to commit as it's meant to be public

### Performance Notes
- Server-side execution reduces client memory usage by 95% (from 500MB+ to <100MB)
- Execution frequency reduced by 460x (from every second to candle boundaries)
- No SharedArrayBuffer or Web Workers for trader execution
- Only indicatorWorker remains for chart calculations
- Real-time updates via WebSocket with efficient Map-based state management


## Critical Architecture: Trader Indicators

### IMPORTANT: How Traders Work with Indicators
Each trader has their own **custom generated filter code** that runs server-side in Edge Functions. DO NOT try to calculate all indicators for all traders - this is incorrect and will break the architecture.

### The Three-Part System:
1. **Filter Code** (`trader.filter.code`): JavaScript code that executes server-side to identify matching symbols
   - Receives: ticker data, timeframe klines, helper functions
   - Calculates whatever indicators it needs internally
   - Returns: boolean (matches or not)

2. **Indicator Configurations** (`trader.filter.indicators`): Array of indicator definitions for chart visualization
   - Defines which indicators to display on charts
   - Used by `calculateIndicators()` to compute values for visualization
   - CRITICAL: Must include ALL indicators the trader's analysis needs

3. **AI Analysis** (`browserAnalysisEngine.analyzeSetup()`): Analyzes signals using provided indicators
   - Receives: Market data with `calculatedIndicators` if trader has indicator configs
   - NO FALLBACK: If no indicators configured, only receives price and volume
   - PROBLEM: If indicators array is empty/incomplete, AI doesn't get needed data

### Why Traders May Not Receive Indicator Data:
- The `indicators` array in `trader.filter` wasn't properly populated during generation
- There's a disconnect between what the filter code calculates and what's in the indicators array
- The AI trader needs specific indicators but they're not in the configuration

### Correct Flow:
1. User describes strategy → `generateTrader()` creates trader with:
   - Filter code that calculates needed conditions
   - Indicators array that MUST include all indicators for both visualization AND analysis
   - Required timeframes for multi-timeframe analysis

2. When signal matches → `useSignalLifecycle` calculates configured indicators:
   - If `trader.filter.indicators` exists → calculates those specific indicators
   - Passes calculated indicators to AI analysis as `marketData.calculatedIndicators`

3. AI receives proper data → Can perform sophisticated analysis

### DO NOT:
- Force calculate all possible indicators for every trader
- Add ANY fallback indicator calculations (traders must have properly configured indicators)
- Assume all traders need the same indicators
- Provide default indicators when none are configured

### DO:
- Ensure `generateTrader()` properly populates the indicators array
- Validate that indicators match what the strategy needs
- Pass trader-specific calculated indicators to the AI

## Core Flows

### Authentication & Signal Creation Flow
When an anonymous user tries to create a signal:

1. **User clicks "Create"** → TraderForm opens
2. **User enters strategy description** → Stored in component state
3. **User clicks "Generate Signal"** → Auth check happens:
   - If not authenticated: Shows EmailAuthModal
   - Strategy description is saved to localStorage as 'pendingScreenerPrompt'
4. **User enters email** → Receives magic link
5. **User clicks magic link** → Returns to app as FREE tier user
6. **TraderForm automatically restores**:
   - Checks localStorage for 'pendingScreenerPrompt' on mount
   - Pre-fills the strategy description
   - Clears localStorage after use
7. **User sees tier restriction**:
   - FREE users see "Upgrade to Pro" message
   - Cannot actually create signal until Pro/Elite tier

### Tier Access Rules
- **Anonymous**: View basic signals, charts, real-time triggers only
- **Free**: + More signals, history, favorites (NO custom signals)
- **Pro**: + Create up to 10 custom signals, notifications
- **Elite**: + Unlimited signals, AI analysis/monitoring/trading

### Important: Authentication Gates
- TraderForm must check authentication BEFORE any database operations
- Free tier users must be blocked from creating signals (only Pro+)
- Strategy descriptions must persist across login redirects

## Git Commits
- Create a commit after every task is complete.
- Do frequent commits so that we can roll back changes easily.
- Use the Github MCP tool for commits.

## Sub-Agent use
- Use the available research sub-agents
- Notify the user of which sub-agent you're calling at each sub-agent call.

## AI Development Workflow

### Workflow Documentation
All feature development uses a **single-file issue workflow** where each feature's complete journey lives in one markdown file in the `issues/` directory.

**Structure:**
```
issues/
├── YYYY-MM-DD-feature-name.md  # One file per feature
├── index.md                     # Auto-generated dashboard
└── README.md                    # Workflow documentation
```

### Development Process
Follow the structured 9-stage workflow, all within a single issue file:
1. `/spec-init` - Initialize context (first time only, creates `.ai-workflow/context/`)
2. `/new` - Create new issue file with idea review
3. `/spec` - Append specification to issue file
4. `/design-issue` - Append UI/UX design to issue file
5. `/engineering-review-issue` - Append technical review to issue file
6. `/architect-issue` - Append architecture to issue file
7. `/plan-issue` - Append implementation plan with checkboxes to issue file
8. `/implement-issue` - Execute plan, updating checkboxes in real-time
9. `/update-spec-issue` - Append final documentation to issue file

### Important Workflow Notes
- **Single File Per Feature**: Everything from idea to completion in one file
- **Real-time Progress**: During implementation, checkboxes update in place with timestamps
- **Deep Code Review**: Every stage requires thorough code analysis before decisions
- **Domain Expertise**: All AI agents analyze the project domain and apply relevant industry expertise
- **Testable Phases**: Break implementation into independently verifiable chunks
- **Living Documentation**: Issue files are continuously updated during development

### Context Awareness
System-wide context stored in `.ai-workflow/context/`:
- `SYSTEM.md` - Architecture patterns and conventions
- `FEATURES.md` - Feature registry (what's stable/frozen)
- `DECISIONS.md` - Past architectural decisions
- `PATTERNS.md` - Established code patterns to follow

### Quick Start
```bash
# Create new feature
/new "Your feature idea"

# Then append to the created issue file
/spec issues/YYYY-MM-DD-feature-name.md
/design-issue issues/YYYY-MM-DD-feature-name.md
/engineering-review-issue issues/YYYY-MM-DD-feature-name.md
/architect-issue issues/YYYY-MM-DD-feature-name.md
/plan-issue issues/YYYY-MM-DD-feature-name.md
/implement-issue issues/YYYY-MM-DD-feature-name.md
/update-spec-issue issues/YYYY-MM-DD-feature-name.md

# Check status
/status-issue
/index-issues
```
- if you run into problems with deploys, look at @docs/fly-machine-deploy-lessons.md
