# Architectural Decision Log

## Decision Template
```
Date: YYYY-MM-DD
Decision: [What was decided]
Context: [Why it was needed]
Options Considered:
  1. [Option A]: [Pros/Cons]
  2. [Option B]: [Pros/Cons]
Chosen: [Which option and why]
Impact: [What changes]
Revisit: [When to review]
```

## Decisions

### 2025-01-08: SharedArrayBuffer for Zero-Copy Worker Communication
**Decision:** Implement SharedArrayBuffer with Atomics for worker communication
**Context:** Serialization overhead was causing 172MB data transfers per screening cycle
**Options Considered:**
  1. Continue with postMessage serialization: Simple but slow (344ms overhead)
  2. Batch processing: Reduces frequency but still has overhead
  3. SharedArrayBuffer: Complex but zero-copy (0ms overhead)
**Chosen:** SharedArrayBuffer for ultimate performance
**Impact:** 100% reduction in serialization overhead, requires COOP/COEP headers
**Status:** Beta - monitoring for stability

### 2025-01-07: Persistent Worker Architecture
**Decision:** Keep workers alive between executions vs spawning new ones
**Context:** Worker initialization overhead was impacting performance
**Options Considered:**
  1. Spawn workers per execution: Simple but slow startup
  2. Worker pool with recycling: Moderate complexity
  3. Persistent workers: Complex state management but fastest
**Chosen:** Persistent workers with state management
**Impact:** Eliminated worker startup overhead, added complexity
**Status:** Active

### 2025-01-06: Multi-Trader Parallel Execution
**Decision:** Execute multiple traders in parallel using Web Workers
**Context:** Sequential execution was too slow for 20+ traders
**Options Considered:**
  1. Sequential execution: Simple but slow
  2. Async/await in main thread: Better but blocks UI
  3. Web Workers: Parallel execution without blocking
**Chosen:** Web Workers for true parallelism
**Impact:** 5-10x performance improvement for multiple traders
**Status:** Active

### 2025-01-05: Firebase AI Logic for Gemini Integration
**Decision:** Use Firebase AI Logic instead of direct Gemini API
**Context:** Need secure API key management without exposing keys in frontend
**Options Considered:**
  1. Direct Gemini API: Requires exposing API keys
  2. Backend proxy server: Additional infrastructure
  3. Firebase AI Logic: Serverless with built-in security
**Chosen:** Firebase AI Logic for security and simplicity
**Impact:** Secure AI integration without backend overhead
**Status:** Active

### 2025-01-04: Tiered Subscription Model
**Decision:** Implement Free/Pro/Elite tiers with progressive features
**Context:** Need monetization strategy while keeping app accessible
**Options Considered:**
  1. Fully free: No revenue
  2. Single paid tier: Too restrictive
  3. Multiple tiers: Progressive value proposition
**Chosen:** Three-tier system for flexibility
**Impact:** Clear upgrade path, revenue potential
**Status:** Active

### 2025-01-03: React Context for State Management
**Decision:** Use React Context API instead of Redux/Zustand
**Context:** Need state management solution for auth, subscriptions, strategies
**Options Considered:**
  1. Redux: Powerful but overkill for current needs
  2. Zustand: Simpler but additional dependency
  3. React Context: Built-in, sufficient for current scale
**Chosen:** React Context for simplicity
**Impact:** Less boilerplate, may need migration if app grows
**Revisit:** When app complexity increases significantly

### 2025-01-02: Supabase for Backend Services
**Decision:** Use Supabase for database, auth, and backend
**Context:** Need backend services without managing infrastructure
**Options Considered:**
  1. Custom backend: Full control but high maintenance
  2. Firebase: Good but Firestore less suitable for relational data
  3. Supabase: PostgreSQL, auth, and real-time in one
**Chosen:** Supabase for comprehensive solution
**Impact:** Rapid development, PostgreSQL benefits
**Status:** Active

### 2025-01-01: Monorepo with pnpm Workspaces
**Decision:** Structure project as monorepo using pnpm workspaces
**Context:** Multiple apps (main app, marketing site) sharing code
**Options Considered:**
  1. Separate repositories: Simple but code duplication
  2. npm/yarn workspaces: Works but slower
  3. pnpm workspaces: Fast, efficient, good monorepo support
**Chosen:** pnpm for performance and disk efficiency
**Impact:** Shared dependencies, faster installs
**Status:** Active

### 2024-12-30: Vite Over Create React App
**Decision:** Use Vite as build tool instead of CRA
**Context:** Need fast development experience and modern tooling
**Options Considered:**
  1. Create React App: Standard but slow and outdated
  2. Next.js: Great but overkill for SPA
  3. Vite: Fast, modern, great DX
**Chosen:** Vite for speed and simplicity
**Impact:** Instant HMR, faster builds
**Status:** Active

### 2024-12-29: Chart.js for Financial Charts
**Decision:** Use Chart.js with chartjs-chart-financial plugin
**Context:** Need candlestick charts with technical indicators
**Options Considered:**
  1. TradingView widget: Professional but limited customization
  2. Recharts: Good for basic charts, poor financial support
  3. Chart.js + plugin: Flexible, good financial charts
**Chosen:** Chart.js for customization flexibility
**Impact:** Full control over chart behavior
**Status:** Active

### 2024-12-28: WebSocket for Real-time Data
**Decision:** Use Binance WebSocket streams for market data
**Context:** Need real-time price and kline updates
**Options Considered:**
  1. REST API polling: Simple but inefficient
  2. Server-sent events: One-way only
  3. WebSocket: Bidirectional, real-time
**Chosen:** WebSocket for true real-time updates
**Impact:** Sub-second latency, efficient bandwidth
**Status:** Active

### 2024-12-27: TypeScript Strict Mode
**Decision:** Enable TypeScript strict mode from start
**Context:** Prevent type-related bugs early
**Options Considered:**
  1. No TypeScript: Faster initially but more bugs
  2. Loose TypeScript: Some benefits but misses issues
  3. Strict TypeScript: Catches most issues early
**Chosen:** Strict mode for code quality
**Impact:** More upfront work, fewer runtime errors
**Status:** Active

## Pending Decisions

### Backtesting Architecture
**Context:** Users want to test strategies on historical data
**Options to Consider:**
  1. Client-side backtesting: Limited by browser resources
  2. Server-side backtesting: Scalable but requires infrastructure
  3. Hybrid approach: Basic client, advanced server
**Target Decision:** Q2 2025

### API Architecture
**Context:** Users want programmatic access
**Options to Consider:**
  1. REST API: Standard, well-understood
  2. GraphQL: Flexible queries
  3. WebSocket API: Real-time subscriptions
**Target Decision:** Q2 2025

### Mobile App Strategy
**Context:** Users want mobile access
**Options to Consider:**
  1. Progressive Web App: Current approach
  2. React Native: Code sharing with web
  3. Native apps: Best performance
**Target Decision:** Q2 2025

## Decision Review Schedule

### Quarterly Reviews
- State management solution (React Context)
- Worker architecture performance
- AI service provider (Gemini/Firebase)

### Annual Reviews
- Backend provider (Supabase)
- Monorepo structure
- Build tooling (Vite)

## Lessons Learned

### What Worked Well
- Firebase AI Logic simplified AI integration
- SharedArrayBuffer eliminated major bottleneck
- Tiered subscriptions provide clear value prop
- pnpm workspaces improved development speed

### What Didn't Work
- Initial postMessage serialization (replaced)
- Synchronous trader execution (replaced)
- Complex indicator calculations in main thread (moved to workers)

### Future Considerations
- Consider state management migration if app grows significantly
- Evaluate dedicated backend if Supabase limits are hit
- Consider native mobile apps for better performance
- Investigate edge computing for global latency reduction