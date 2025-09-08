# Technical Debt Inventory

## Debt Severity Levels
- 🔴 **Critical**: Blocking features or causing failures
- 🟡 **High**: Impacting performance or maintainability
- 🟢 **Medium**: Should be addressed but not urgent
- 🔵 **Low**: Nice to have improvements

## Current Technical Debt

### 🔴 Critical Issues

#### 1. Worker Communication Instability
**Location:** `/apps/app/workers/persistentTraderWorker.ts`
**Issue:** Workers occasionally fail to receive ADD_TRADER messages after READY signal
**Impact:** Traders don't execute, signals are missed
**Proposed Fix:** Implement message queue with acknowledgment system
**Effort:** 2-3 days
**Dependencies:** None

#### 2. Memory Leaks in Long Sessions
**Location:** `/apps/app/src/App.tsx`, various hooks
**Issue:** Memory usage grows unbounded over hours of operation
**Impact:** Browser tab crashes after extended use
**Proposed Fix:** Implement aggressive cleanup cycles, WeakMap for caches
**Effort:** 3-4 days
**Dependencies:** Memory monitoring tools

### 🟡 High Priority

#### 3. No Test Coverage
**Location:** Entire codebase
**Issue:** Minimal to no automated tests
**Impact:** Regressions go unnoticed, refactoring is risky
**Proposed Fix:** Add Vitest unit tests, Playwright E2E tests
**Effort:** 2-3 weeks ongoing
**Dependencies:** Test infrastructure setup

#### 4. AI Prompt Brittleness
**Location:** `/apps/app/src/services/geminiService.ts`
**Issue:** Prompts occasionally generate invalid JavaScript
**Impact:** Filter generation fails, poor user experience
**Proposed Fix:** Better prompt engineering, validation layer, fallbacks
**Effort:** 1 week
**Dependencies:** Prompt testing framework

#### 5. WebSocket Reconnection Logic
**Location:** `/apps/app/src/services/binanceService.ts`
**Issue:** Reconnection after network interruption is unreliable
**Impact:** Data stream stops, requires page refresh
**Proposed Fix:** Exponential backoff, connection state machine
**Effort:** 3-4 days
**Dependencies:** None

#### 6. Inefficient Re-renders
**Location:** `/apps/app/src/components/LiveScreenerTable.tsx`
**Issue:** Entire table re-renders on single cell update
**Impact:** UI lag with many active signals
**Proposed Fix:** React.memo, virtualization, granular updates
**Effort:** 2-3 days
**Dependencies:** React DevTools profiling

### 🟢 Medium Priority

#### 7. Hardcoded Configuration
**Location:** Various services
**Issue:** API endpoints, limits, intervals hardcoded
**Impact:** Difficult to configure for different environments
**Proposed Fix:** Centralized configuration with environment variables
**Effort:** 1-2 days
**Dependencies:** None

#### 8. No Error Boundaries
**Location:** Component tree
**Issue:** Single component error crashes entire app
**Impact:** Poor error recovery, blank screens
**Proposed Fix:** Add error boundaries at strategic points
**Effort:** 1 day
**Dependencies:** Error logging service

#### 9. Inconsistent Error Handling
**Location:** Throughout codebase
**Issue:** Mix of try-catch, .catch(), and unhandled promises
**Impact:** Silent failures, difficult debugging
**Proposed Fix:** Standardized error handling pattern
**Effort:** 3-4 days
**Dependencies:** Logging infrastructure

#### 10. Type Safety Gaps
**Location:** AI-generated code, worker messages
**Issue:** Any types, missing interfaces, runtime type errors
**Impact:** Type errors only caught at runtime
**Proposed Fix:** Strict typing, runtime validation with Zod
**Effort:** 1 week
**Dependencies:** None

#### 11. Bundle Size
**Location:** Build output
**Issue:** Large bundle size (>2MB), slow initial load
**Impact:** Poor performance on slow connections
**Proposed Fix:** Code splitting, lazy loading, tree shaking
**Effort:** 2-3 days
**Dependencies:** Bundle analyzer

### 🔵 Low Priority

#### 12. Console Log Pollution
**Location:** Throughout codebase
**Issue:** Excessive debug logging in production
**Impact:** Performance impact, hard to find real issues
**Proposed Fix:** Conditional logging, log levels
**Effort:** 1 day
**Dependencies:** None

#### 13. Magic Numbers
**Location:** Various calculations
**Issue:** Hardcoded numbers without explanation
**Impact:** Difficult to understand and modify
**Proposed Fix:** Named constants with comments
**Effort:** 2-3 hours
**Dependencies:** None

#### 14. Duplicate Code
**Location:** Worker files, service layers
**Issue:** Similar code patterns repeated
**Impact:** Maintenance burden, inconsistencies
**Proposed Fix:** Extract shared utilities
**Effort:** 2-3 days
**Dependencies:** None

#### 15. Missing Documentation
**Location:** Complex functions, API contracts
**Issue:** No JSDoc comments, unclear interfaces
**Impact:** Onboarding difficulty, maintenance issues
**Proposed Fix:** Add comprehensive documentation
**Effort:** 1 week ongoing
**Dependencies:** Documentation tools

## Performance Bottlenecks

### Identified Hotspots
1. **Indicator Calculations**: Running in main thread for charts
2. **State Updates**: Too frequent, causing re-renders
3. **WebSocket Processing**: No buffering, immediate updates
4. **Chart Rendering**: Full redraw on data change
5. **Worker Serialization**: Fixed with SharedArrayBuffer but needs monitoring

### Memory Issues
1. **Historical Data**: Keeps all klines in memory
2. **Signal History**: Never pruned old signals
3. **Chart Instances**: Not properly destroyed
4. **Event Listeners**: Not cleaned up in useEffect
5. **Worker Messages**: Large objects kept in closures

## Security Concerns

### Medium Risk
1. **AI Code Execution**: Executes generated code without sandboxing
2. **LocalStorage Secrets**: Stores sensitive data unencrypted
3. **CORS Headers**: Overly permissive for SharedArrayBuffer
4. **Input Validation**: Missing on user inputs

### Low Risk
1. **Dependency Vulnerabilities**: Some outdated packages
2. **Error Messages**: May leak internal information
3. **Rate Limiting**: No client-side rate limiting

## Database & API

### Schema Issues
1. **Missing Indexes**: Slow queries on large tables
2. **No Soft Deletes**: Hard deletes lose history
3. **RLS Policies**: Some tables missing proper policies
4. **Migration Versioning**: No rollback strategy

### API Design
1. **No Pagination**: Large result sets returned entirely
2. **No Caching**: Every request hits database
3. **No Rate Limiting**: Vulnerable to abuse
4. **No API Versioning**: Breaking changes affect all clients

## Code Quality Issues

### Architecture
1. **Tight Coupling**: Services directly depend on each other
2. **God Components**: App.tsx has too many responsibilities
3. **Prop Drilling**: Deep component hierarchies
4. **Mixed Concerns**: Business logic in UI components

### Maintainability
1. **No Design System**: Inconsistent UI patterns
2. **Ad-hoc Styling**: Mix of Tailwind classes everywhere
3. **No Storybook**: Difficult to develop components in isolation
4. **No Changelog**: Changes not documented

## Monitoring & Observability

### Missing Infrastructure
1. **No APM**: Can't track performance in production
2. **No Error Tracking**: Sentry or similar not configured
3. **No Analytics**: User behavior unknown
4. **No Alerts**: Issues discovered by users
5. **No Metrics**: Can't track business KPIs

## Refactoring Opportunities

### High Value
1. **Extract SignalManager**: Separate signal logic from App.tsx
2. **Create DataProvider**: Centralize market data management
3. **Implement Repository Pattern**: Abstract database access
4. **Create UI Component Library**: Reusable components

### Future Considerations
1. **Microservices**: Split into smaller services
2. **Event Sourcing**: For trading history
3. **CQRS**: Separate read/write models
4. **GraphQL**: Replace REST API

## Debt Reduction Plan

### Phase 1 (Sprint 1-2)
- Fix critical worker communication issues
- Add error boundaries
- Implement memory cleanup

### Phase 2 (Sprint 3-4)
- Add test infrastructure
- Improve AI prompts
- Fix WebSocket reconnection

### Phase 3 (Sprint 5-6)
- Performance optimizations
- Security hardening
- Documentation

### Phase 4 (Ongoing)
- Refactoring
- Code quality improvements
- Monitoring setup

## Metrics to Track

### Code Quality
- Test coverage: Target 70%
- Type coverage: Target 95%
- Bundle size: Target <1MB
- Lighthouse score: Target >90

### Performance
- Time to Interactive: <3s
- Memory usage: <500MB
- Worker execution: <50ms
- WebSocket latency: <100ms

### Reliability
- Error rate: <0.1%
- Crash rate: <0.01%
- WebSocket uptime: >99.9%
- Signal accuracy: >90%