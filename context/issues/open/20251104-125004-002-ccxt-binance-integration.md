# Integrate CCXT for Binance Spot Trading

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-04 12:50:04

## Context

Integrate CCXT library to enable programmatic trading on Binance Spot exchange. CCXT provides a unified API across exchanges and handles authentication, rate limiting, and error handling.

**Why CCXT:**
- Battle-tested across 100+ exchanges
- Unified API reduces exchange-specific code
- Built-in rate limiting and retry logic
- Active maintenance and community support
- TypeScript/JavaScript support (can call from Go via subprocess)

## Linked Items

- Part of: `context/issues/open/20251104-125004-000-PROJECT-trade-execution-infrastructure.md`
- Depends on: `context/issues/open/20251104-125004-001-positions-schema-and-lifecycle.md`
- Blocks: `context/issues/open/20251104-125004-003-order-execution-engine.md`

## Progress

**Status:** Not started

## Spec

### Architecture Decision: Go + Node.js Subprocess

**Options considered:**
1. **Pure Go** - Use ccxt-go (unofficial port, less maintained)
2. **Go + Python subprocess** - Call ccxt via Python script
3. **Go + Node.js subprocess** - Call ccxt via Node.js script
4. **Supabase Edge Function** - Move all CCXT calls to Edge Function

**Selected: Go + Node.js subprocess**

**Rationale:**
- Official CCXT is JavaScript/Python (JS version more actively maintained)
- We already have Node.js in the project (pnpm, frontend)
- Subprocess keeps Go backend in control (error handling, retries, timeouts)
- Easier to test CCXT independently
- Can migrate to Edge Function later if needed

### Implementation Approach

**Create CCXT microservice:**
`backend/ccxt-service/` - Node.js service that exposes CCXT via JSON-RPC

**Go calls CCXT service via stdin/stdout:**
```go
type CCXTClient struct {
    cmd *exec.Cmd
    stdin io.WriteCloser
    stdout io.ReadCloser
}

func (c *CCXTClient) CreateOrder(params OrderParams) (*Order, error) {
    request := map[string]interface{}{
        "method": "createOrder",
        "params": params,
    }

    // Write JSON to stdin
    json.NewEncoder(c.stdin).Encode(request)

    // Read JSON from stdout
    var response OrderResponse
    json.NewDecoder(c.stdout).Decode(&response)

    return response.Order, response.Error
}
```

### CCXT Service API

**Location:** `backend/ccxt-service/index.ts`

**Methods to implement:**

```typescript
interface CCXTService {
  // Order operations
  createOrder(symbol: string, type: string, side: string, amount: number, price?: number): Order
  cancelOrder(orderId: string, symbol: string): Order
  fetchOrder(orderId: string, symbol: string): Order
  fetchOpenOrders(symbol?: string): Order[]

  // Market data
  fetchTicker(symbol: string): Ticker
  fetchBalance(): Balance

  // Account
  fetchMyTrades(symbol?: string, since?: number, limit?: number): Trade[]

  // Exchange info
  fetchMarkets(): Market[]
  loadMarkets(): void
}
```

**Example request/response:**

Request (stdin):
```json
{
  "id": "req-123",
  "method": "createOrder",
  "params": {
    "symbol": "BTC/USDT",
    "type": "market",
    "side": "buy",
    "amount": 0.001,
    "apiKey": "...",
    "secret": "..."
  }
}
```

Response (stdout):
```json
{
  "id": "req-123",
  "result": {
    "id": "12345678",
    "symbol": "BTC/USDT",
    "type": "market",
    "side": "buy",
    "price": 43250.50,
    "amount": 0.001,
    "filled": 0.001,
    "remaining": 0,
    "status": "closed",
    "timestamp": 1699000000000
  },
  "error": null
}
```

### CCXT Service Implementation

**Package.json:**
```json
{
  "name": "ccxt-service",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "ccxt": "^4.1.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "tsx": "^4.0.0"
  },
  "scripts": {
    "start": "tsx index.ts",
    "build": "tsc",
    "test": "tsx test.ts"
  }
}
```

**index.ts:**
```typescript
import ccxt from 'ccxt';
import * as readline from 'readline';

interface RPCRequest {
  id: string;
  method: string;
  params: any;
}

interface RPCResponse {
  id: string;
  result?: any;
  error?: string;
}

class CCXTService {
  private exchanges: Map<string, ccxt.Exchange> = new Map();

  async handleRequest(req: RPCRequest): Promise<RPCResponse> {
    try {
      const exchange = this.getOrCreateExchange(req.params.apiKey, req.params.secret);

      switch (req.method) {
        case 'createOrder':
          const order = await exchange.createOrder(
            req.params.symbol,
            req.params.type,
            req.params.side,
            req.params.amount,
            req.params.price
          );
          return { id: req.id, result: order };

        case 'cancelOrder':
          const cancelled = await exchange.cancelOrder(
            req.params.orderId,
            req.params.symbol
          );
          return { id: req.id, result: cancelled };

        case 'fetchOrder':
          const fetched = await exchange.fetchOrder(
            req.params.orderId,
            req.params.symbol
          );
          return { id: req.id, result: fetched };

        case 'fetchBalance':
          const balance = await exchange.fetchBalance();
          return { id: req.id, result: balance };

        case 'fetchTicker':
          const ticker = await exchange.fetchTicker(req.params.symbol);
          return { id: req.id, result: ticker };

        default:
          return { id: req.id, error: `Unknown method: ${req.method}` };
      }
    } catch (error) {
      return {
        id: req.id,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private getOrCreateExchange(apiKey: string, secret: string): ccxt.binance {
    const cacheKey = `${apiKey}:${secret}`;

    if (!this.exchanges.has(cacheKey)) {
      const exchange = new ccxt.binance({
        apiKey,
        secret,
        options: {
          defaultType: 'spot',
          adjustForTimeDifference: true
        }
      });
      this.exchanges.set(cacheKey, exchange);
    }

    return this.exchanges.get(cacheKey) as ccxt.binance;
  }
}

async function main() {
  const service = new CCXTService();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', async (line) => {
    try {
      const request: RPCRequest = JSON.parse(line);
      const response = await service.handleRequest(request);
      console.log(JSON.stringify(response));
    } catch (error) {
      console.error(JSON.stringify({
        id: 'unknown',
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  });
}

main();
```

### Go Client Implementation

**Location:** `backend/go-screener/pkg/ccxt/client.go`

```go
package ccxt

import (
    "bufio"
    "encoding/json"
    "fmt"
    "io"
    "os/exec"
    "sync"
)

type Client struct {
    cmd    *exec.Cmd
    stdin  io.WriteCloser
    stdout *bufio.Reader
    mu     sync.Mutex
    reqID  int
}

type Request struct {
    ID     string      `json:"id"`
    Method string      `json:"method"`
    Params interface{} `json:"params"`
}

type Response struct {
    ID     string          `json:"id"`
    Result json.RawMessage `json:"result,omitempty"`
    Error  string          `json:"error,omitempty"`
}

func NewClient() (*Client, error) {
    cmd := exec.Command("pnpm", "run", "start")
    cmd.Dir = "./backend/ccxt-service"

    stdin, err := cmd.StdinPipe()
    if err != nil {
        return nil, err
    }

    stdout, err := cmd.StdoutPipe()
    if err != nil {
        return nil, err
    }

    if err := cmd.Start(); err != nil {
        return nil, err
    }

    return &Client{
        cmd:    cmd,
        stdin:  stdin,
        stdout: bufio.NewReader(stdout),
    }, nil
}

func (c *Client) call(method string, params interface{}) (*Response, error) {
    c.mu.Lock()
    defer c.mu.Unlock()

    c.reqID++
    reqID := fmt.Sprintf("req-%d", c.reqID)

    req := Request{
        ID:     reqID,
        Method: method,
        Params: params,
    }

    // Send request
    if err := json.NewEncoder(c.stdin).Encode(req); err != nil {
        return nil, err
    }

    // Read response
    line, err := c.stdout.ReadBytes('\n')
    if err != nil {
        return nil, err
    }

    var resp Response
    if err := json.Unmarshal(line, &resp); err != nil {
        return nil, err
    }

    if resp.Error != "" {
        return nil, fmt.Errorf("ccxt error: %s", resp.Error)
    }

    return &resp, nil
}

func (c *Client) CreateOrder(apiKey, secret, symbol, orderType, side string, amount, price float64) (*Order, error) {
    params := map[string]interface{}{
        "apiKey": apiKey,
        "secret": secret,
        "symbol": symbol,
        "type":   orderType,
        "side":   side,
        "amount": amount,
    }

    if price > 0 {
        params["price"] = price
    }

    resp, err := c.call("createOrder", params)
    if err != nil {
        return nil, err
    }

    var order Order
    if err := json.Unmarshal(resp.Result, &order); err != nil {
        return nil, err
    }

    return &order, nil
}

func (c *Client) Close() error {
    c.stdin.Close()
    return c.cmd.Wait()
}
```

### Testing Strategy

**Unit tests (CCXT service):**
```typescript
// backend/ccxt-service/test.ts
import { CCXTService } from './index';

async function testCreateOrder() {
  const service = new CCXTService();
  const req = {
    id: 'test-1',
    method: 'createOrder',
    params: {
      apiKey: process.env.BINANCE_TESTNET_KEY,
      secret: process.env.BINANCE_TESTNET_SECRET,
      symbol: 'BTC/USDT',
      type: 'market',
      side: 'buy',
      amount: 0.001
    }
  };

  const resp = await service.handleRequest(req);
  console.log('Order created:', resp.result);
}

testCreateOrder();
```

**Integration tests (Go):**
```go
func TestCCXTClient(t *testing.T) {
    client, err := ccxt.NewClient()
    require.NoError(t, err)
    defer client.Close()

    // Test on Binance testnet
    order, err := client.CreateOrder(
        os.Getenv("BINANCE_TESTNET_KEY"),
        os.Getenv("BINANCE_TESTNET_SECRET"),
        "BTC/USDT",
        "market",
        "buy",
        0.001,
        0,
    )

    require.NoError(t, err)
    assert.Equal(t, "closed", order.Status)
}
```

### Error Handling

**CCXT errors to handle:**
- `InsufficientFunds` - Not enough balance
- `InvalidOrder` - Order validation failed
- `OrderNotFound` - Can't find order
- `NetworkError` - Exchange unreachable
- `ExchangeNotAvailable` - Exchange maintenance
- `RateLimitExceeded` - Too many requests

**Retry strategy:**
- Network errors: Retry 3x with exponential backoff
- Rate limit: Wait and retry
- Invalid order: Don't retry, return error
- Insufficient funds: Don't retry, return error

### Success Criteria

- [ ] CCXT service starts and accepts JSON-RPC requests
- [ ] Go client can communicate with CCXT service
- [ ] Can create market orders on Binance testnet
- [ ] Can create limit orders on Binance testnet
- [ ] Can cancel orders
- [ ] Can fetch order status
- [ ] Can fetch account balance
- [ ] Error handling works for all error types
- [ ] Service auto-restarts if crashed
- [ ] Performance: < 200ms per order creation

### Effort Estimate

**4-5 days**
- Day 1: CCXT service setup, basic methods
- Day 2: Go client implementation
- Day 3: Error handling and retry logic
- Day 4: Testing on Binance testnet
- Day 5: Documentation and integration
