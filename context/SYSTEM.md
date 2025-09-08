# System Context

## Architecture Overview

This is a high-performance, AI-powered cryptocurrency screener for Binance Spot markets that uses natural language processing to create and execute technical trading strategies in real-time. The system features a sophisticated multi-tier architecture with advanced memory optimization and real-time data streaming capabilities.

## Technology Stack

- **Frontend:** React 19.1.0, TypeScript 5.7.2, Vite 6.2.0
- **UI Framework:** Tailwind CSS 3.x, Radix UI components
- **Charting:** Chart.js 4.5.0 with chartjs-chart-financial
- **Backend:** Supabase (PostgreSQL, Auth, Edge Functions)
- **AI Services:** Firebase AI Logic, Google Gemini 2.5 Flash
- **Real-time:** WebSocket (Binance streams), SharedArrayBuffer
- **Infrastructure:** Vercel deployment, pnpm workspaces monorepo

## Core Patterns

### Code Organization
```
apps/app/
  src/
    components/      # React UI components (modular, reusable)
    services/        # External service integrations (Binance, AI, etc.)
    hooks/           # Custom React hooks for shared logic
    utils/           # Utility functions and helpers
    features/        # Feature-specific modules (signals, trading)
    workers/         # Web Worker implementations
    config/          # Configuration files (Firebase, etc.)
  
  lib/              # Core libraries (screener helpers)
  types/            # TypeScript type definitions
```

### State Management
- **Pattern:** React Context API + Local State
- **Approach:** Hierarchical contexts for auth, subscription, and strategy
- **Performance:** Map-based state for O(1) lookups
- **Real-time:** Direct state updates from WebSocket streams
- **Memory:** Automatic cleanup with age-based pruning

### Data Flow
1. **WebSocket Connection** → Binance real-time streams
2. **Batch Processing** → BatchedUpdater aggregates updates
3. **State Update** → Map-based state structures updated
4. **Worker Execution** → Filters run in parallel workers
5. **Signal Detection** → Matches trigger signal creation
6. **AI Analysis** → Elite tier gets automated analysis
7. **UI Rendering** → React components display results

## Coding Conventions

### TypeScript
- **Strict mode:** Enabled with comprehensive type checking
- **Interface naming:** No I prefix, descriptive names
- **Type exports:** Centralized in types.ts files
- **Generics:** Extensive use for reusable components
- **Enums:** String enums for constants

### React
- **Component structure:** Functional components with hooks
- **Hook patterns:** Custom hooks for shared logic (use* prefix)
- **Props validation:** TypeScript interfaces
- **Memoization:** React.memo for expensive renders
- **Error boundaries:** Wrapped around critical sections

### Testing
- **Framework:** Vitest (configured but minimal coverage)
- **Coverage target:** Not currently enforced
- **E2E approach:** Manual testing primary method

## Performance Requirements
- **Initial load:** <3 seconds
- **WebSocket latency:** <100ms for updates
- **Worker execution:** <50ms per screening cycle
- **Memory usage:** <500MB for 100 symbols
- **Concurrent traders:** Up to 20 active
- **Real-time symbols:** 100+ with streaming data

## Security Requirements
- **Authentication:** Supabase Auth (magic links, OAuth)
- **Authorization:** Row-level security (RLS) in PostgreSQL
- **API keys:** Server-side only via Firebase AI Logic
- **Data encryption:** HTTPS for all communications
- **CORS:** Proper headers for SharedArrayBuffer
- **Rate limiting:** Binance API limits respected

## Dependencies

### Core Dependencies
- react: ^19.1.0
- typescript: ^5.7.2
- vite: ^6.2.0
- @supabase/supabase-js: ^2.50.0
- firebase: ^11.2.0
- chart.js: ^4.5.0
- @radix-ui/react-*: Various UI components
- tailwindcss: ^3.4.17

### Development Tools
- @vitejs/plugin-react: ^4.3.4
- postcss: ^8.5.3
- autoprefixer: ^10.4.20
- @types/react: ^19.1.0

## Database Schema

### Key Tables (Supabase PostgreSQL)
- **user_profiles**: User data and subscription tiers
- **traders**: Custom trading strategies and filters
- **exchange_accounts**: Connected trading accounts
- **workflow_templates**: Automated trading workflows
- **prompts**: AI prompt templates for operations

### Row-Level Security
All tables implement RLS policies for data isolation:
- Users can only access their own data
- Public data (like shared signals) visible to all
- Admin functions restricted to service role

## API Structure

### REST Endpoints (Supabase)
- `/auth/*`: Authentication endpoints
- `/rest/v1/*`: Database API (auto-generated)

### WebSocket Events (Binance)
- `ticker@arr`: Real-time price updates
- `{symbol}@kline_{interval}`: Candlestick data
- `depth`: Order book updates (planned)

### AI Services (Firebase AI Logic)
- `generateContent()`: Generate trading filters
- `generateContentStream()`: Streaming AI responses

## Deployment
- **Production:** Vercel (automatic from main branch)
- **Preview:** Vercel preview deployments for PRs
- **Database:** Supabase hosted PostgreSQL
- **CI/CD:** GitHub Actions for builds
- **Monitoring:** Vercel Analytics
- **Error tracking:** Browser console (no Sentry yet)

## Performance Optimizations

### Memory Management
- **LimitedMap<T>**: Size-constrained data structures
- **Age-based pruning**: Remove old signals/trades
- **Memory monitoring**: Real-time usage tracking
- **Cleanup cycles**: Automatic memory recovery

### Worker Strategies
1. **Individual Workers**: Basic parallel processing
2. **Batched Workers**: Optimized batch execution
3. **Shared Memory**: Zero-copy SharedArrayBuffer (fastest)

### WebSocket Optimization
- **Batch updates**: Aggregate multiple updates
- **Throttling**: Limit update frequency
- **Selective subscriptions**: Only required symbols
- **Connection pooling**: Reuse WebSocket connections

## System Constraints

### API Limitations
- **Binance rate limits**: 1200 requests/minute
- **Gemini API**: Model-specific token limits
- **Supabase**: Connection and bandwidth limits
- **Worker threads**: Browser-dependent limits

### Browser Requirements
- **Modern browsers**: Chrome 90+, Firefox 90+, Safari 15+
- **SharedArrayBuffer**: Requires secure context (HTTPS)
- **WebWorkers**: Full support required
- **WebSocket**: Stable connection needed