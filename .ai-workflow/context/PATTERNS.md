# Coding Patterns

## Successful Patterns to Follow

### 1. Service Layer Pattern
**Pattern:** Isolate external integrations in service modules
```typescript
// Good: services/binanceService.ts
export class BinanceService {
  private ws: WebSocket | null = null;
  
  async connectWebSocket(symbols: string[]) {
    // Implementation isolated from UI
  }
}

// Usage in components
const service = new BinanceService();
```
**Why:** Separation of concerns, testability, reusability

### 2. Custom Hook Pattern
**Pattern:** Extract complex logic into reusable hooks
```typescript
// Good: hooks/useSignalLifecycle.ts
export function useSignalLifecycle(trader: Trader) {
  const [signals, setSignals] = useState<Signal[]>([]);
  // Complex logic encapsulated
  return { signals, addSignal, removeSignal };
}
```
**Why:** Reusability, cleaner components, easier testing

### 3. Map-Based State for O(1) Lookups
**Pattern:** Use Map instead of arrays for frequently accessed data
```typescript
// Good: O(1) lookup
const [tickers, setTickers] = useState<Map<string, Ticker>>(new Map());
const ticker = tickers.get(symbol); // Fast!

// Bad: O(n) lookup
const [tickers, setTickers] = useState<Ticker[]>([]);
const ticker = tickers.find(t => t.symbol === symbol); // Slow!
```
**Why:** Performance at scale, cleaner updates

### 4. Batch Update Pattern
**Pattern:** Aggregate multiple updates before rendering
```typescript
// Good: BatchedUpdater utility
class BatchedUpdater<T> {
  private updates: T[] = [];
  private timer: NodeJS.Timeout | null = null;
  
  add(update: T) {
    this.updates.push(update);
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), 100);
    }
  }
}
```
**Why:** Reduces re-renders, improves performance

### 5. Worker Thread Pattern
**Pattern:** Offload CPU-intensive work to Web Workers
```typescript
// Good: Parallel execution in worker
const worker = new Worker('./screenerWorker.ts');
worker.postMessage({ traders, data });
worker.onmessage = (e) => handleResults(e.data);
```
**Why:** Non-blocking UI, true parallelism

### 6. Memory Management Pattern
**Pattern:** Implement cleanup and size limits
```typescript
// Good: Automatic cleanup
export class LimitedMap<T> extends Map<string, T> {
  constructor(private maxSize: number) { super(); }
  
  set(key: string, value: T) {
    if (this.size >= this.maxSize) {
      const firstKey = this.keys().next().value;
      this.delete(firstKey);
    }
    return super.set(key, value);
  }
}
```
**Why:** Prevents memory leaks, maintains performance

### 7. Type-Safe Event Pattern
**Pattern:** Use discriminated unions for messages
```typescript
// Good: Type-safe messaging
type WorkerMessage = 
  | { type: 'INIT'; data: SharedBuffers }
  | { type: 'ADD_TRADER'; data: TraderConfig }
  | { type: 'RESULTS'; data: Signal[] };

// Exhaustive handling
switch (message.type) {
  case 'INIT': // TypeScript knows data is SharedBuffers
  case 'ADD_TRADER': // TypeScript knows data is TraderConfig
}
```
**Why:** Type safety, exhaustive checks, clear contracts

### 8. Context Provider Pattern
**Pattern:** Hierarchical context for cross-cutting concerns
```typescript
// Good: Composed providers
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SubscriptionProvider>
        <StrategyProvider>
          {children}
        </StrategyProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
}
```
**Why:** Clean dependency injection, avoid prop drilling

### 9. Ref Pattern for Stable Callbacks
**Pattern:** Use refs to avoid stale closures
```typescript
// Good: Stable callback reference
const onResultsRef = useRef(onResults);
useEffect(() => {
  onResultsRef.current = onResults;
}, [onResults]);

// Use in long-lived callbacks
worker.onmessage = () => onResultsRef.current(data);
```
**Why:** Avoids stale closures, stable references

### 10. Error Boundary Pattern
**Pattern:** Graceful error handling at component boundaries
```typescript
// Good: Error boundary component
class ErrorBoundary extends Component {
  componentDidCatch(error: Error) {
    logError(error);
    this.setState({ hasError: true });
  }
  
  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }
    return this.props.children;
  }
}
```
**Why:** Prevents cascading failures, better UX

## Anti-Patterns to Avoid

### 1. ❌ Direct DOM Manipulation
```typescript
// Bad: Direct DOM access in React
document.getElementById('chart').innerHTML = chartHTML;

// Good: Use React state and refs
const chartRef = useRef<HTMLDivElement>(null);
```

### 2. ❌ Synchronous Heavy Computation
```typescript
// Bad: Blocks UI
const results = symbols.map(s => calculateIndicators(s));

// Good: Use workers or async
const results = await Promise.all(
  symbols.map(s => calculateAsync(s))
);
```

### 3. ❌ Unbounded Data Growth
```typescript
// Bad: Infinite growth
signals.push(newSignal);

// Good: Limit size
if (signals.length > MAX_SIGNALS) {
  signals.shift();
}
signals.push(newSignal);
```

### 4. ❌ Missing Cleanup
```typescript
// Bad: Memory leak
useEffect(() => {
  const timer = setInterval(update, 1000);
  // Missing cleanup!
});

// Good: Proper cleanup
useEffect(() => {
  const timer = setInterval(update, 1000);
  return () => clearInterval(timer);
}, []);
```

### 5. ❌ Prop Drilling
```typescript
// Bad: Passing through many levels
<Parent user={user}>
  <Child user={user}>
    <GrandChild user={user} />
  </Child>
</Parent>

// Good: Use context
const user = useAuth();
```

### 6. ❌ Any Types
```typescript
// Bad: Loses type safety
const handleData = (data: any) => { ... }

// Good: Define types
const handleData = (data: MarketData) => { ... }
```

### 7. ❌ Inline Complex Logic
```typescript
// Bad: Hard to test and understand
<div onClick={() => {
  const filtered = data.filter(d => d.value > 10);
  const sorted = filtered.sort((a, b) => b.value - a.value);
  setState(sorted.slice(0, 10));
}}>

// Good: Extract to function
const handleClick = useCallback(() => {
  const topItems = getTopItems(data, 10);
  setState(topItems);
}, [data]);
```

### 8. ❌ Mutating State
```typescript
// Bad: Mutating state directly
state.signals.push(newSignal);
setState(state);

// Good: Create new object
setState(prev => ({
  ...prev,
  signals: [...prev.signals, newSignal]
}));
```

## Common Utilities and Helpers

### Data Transformation
```typescript
// groupBy utility
export function groupBy<T>(items: T[], key: keyof T): Map<any, T[]> {
  return items.reduce((map, item) => {
    const k = item[key];
    map.set(k, [...(map.get(k) || []), item]);
    return map;
  }, new Map());
}
```

### Performance Utilities
```typescript
// Debounce utility
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): T {
  let timeout: NodeJS.Timeout;
  return ((...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  }) as T;
}
```

### Type Guards
```typescript
// Type guard utility
export function isValidSignal(obj: unknown): obj is Signal {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'symbol' in obj &&
    'traderId' in obj
  );
}
```

### Memory Utilities
```typescript
// Memory monitoring
export function getMemoryUsage(): number {
  if ('memory' in performance) {
    return (performance as any).memory.usedJSHeapSize / 1048576;
  }
  return 0;
}
```

## Reusable Components

### LoadingState Component
```typescript
export function LoadingState({ 
  isLoading, 
  error, 
  children 
}: LoadingStateProps) {
  if (isLoading) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;
  return <>{children}</>;
}
```

### DataTable Component
```typescript
export function DataTable<T>({ 
  data, 
  columns, 
  onRowClick 
}: DataTableProps<T>) {
  return (
    <Table>
      <TableHeader columns={columns} />
      <TableBody data={data} onRowClick={onRowClick} />
    </Table>
  );
}
```

### Modal Component
```typescript
export function Modal({ 
  isOpen, 
  onClose, 
  children 
}: ModalProps) {
  if (!isOpen) return null;
  
  return createPortal(
    <Overlay onClick={onClose}>
      <Content onClick={e => e.stopPropagation()}>
        {children}
      </Content>
    </Overlay>,
    document.body
  );
}
```

## Testing Patterns

### Unit Testing
```typescript
// Good: Isolated unit tests
describe('calculateRSI', () => {
  it('should calculate RSI correctly', () => {
    const prices = [44, 44.34, 44.09, ...];
    const rsi = calculateRSI(prices, 14);
    expect(rsi).toBeCloseTo(70.53, 2);
  });
});
```

### Integration Testing
```typescript
// Good: Test hooks with renderHook
describe('useSignalLifecycle', () => {
  it('should manage signals correctly', () => {
    const { result } = renderHook(() => useSignalLifecycle(trader));
    act(() => result.current.addSignal(signal));
    expect(result.current.signals).toHaveLength(1);
  });
});
```

### E2E Testing
```typescript
// Good: User journey tests
test('create custom signal flow', async ({ page }) => {
  await page.goto('/');
  await page.click('button:has-text("Create Signal")');
  await page.fill('[placeholder="Describe your strategy"]', 'RSI > 70');
  await page.click('button:has-text("Generate")');
  await expect(page.locator('.signal-card')).toBeVisible();
});
```

## Performance Patterns

### Virtual Scrolling
```typescript
// Use react-window for large lists
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={items.length}
  itemSize={50}
>
  {({ index, style }) => (
    <div style={style}>{items[index].name}</div>
  )}
</FixedSizeList>
```

### Code Splitting
```typescript
// Lazy load heavy components
const TradingChart = lazy(() => import('./TradingChart'));

<Suspense fallback={<ChartSkeleton />}>
  <TradingChart />
</Suspense>
```

### Memoization
```typescript
// Memoize expensive calculations
const expensiveValue = useMemo(() => {
  return calculateComplexValue(data);
}, [data]);

// Memoize components
const MemoizedTable = memo(DataTable, (prev, next) => {
  return prev.data === next.data;
});
```