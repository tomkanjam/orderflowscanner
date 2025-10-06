# Integration Tests for AI Analysis Edge Function

This directory contains integration tests for the AI Analysis Edge Function that verify the complete flow from Fly Machine through the Edge Function to the database.

## Prerequisites

### 1. Supabase Setup
You need either:
- **Local Supabase** running (`supabase start`)
- **Remote test project** deployed to Supabase

### 2. Edge Function Deployment
The `ai-analysis` Edge Function must be deployed:
```bash
# Local deployment
supabase functions serve ai-analysis

# Or remote deployment
supabase functions deploy ai-analysis
```

### 3. Environment Variables
Copy `.env.test` and configure:
```bash
cp .env.test .env.test.local
```

Edit `.env.test.local`:
```env
SKIP_INTEGRATION_TESTS=false
SUPABASE_URL=http://localhost:54321  # or your test project URL
SUPABASE_SERVICE_KEY=your-service-key
EDGE_FUNCTION_URL=http://localhost:54321/functions/v1/ai-analysis
```

### 4. Database Migration
Ensure the `signal_analyses` table exists:
```bash
supabase db push
```

## Running Tests

### Run all tests
```bash
pnpm test
```

### Run with watch mode
```bash
pnpm test:watch
```

### Run with UI
```bash
pnpm test:ui
```

### Skip integration tests
Useful for CI/CD when services aren't available:
```bash
SKIP_INTEGRATION_TESTS=true pnpm test
```

## Test Suites

### 1. Full Flow Tests
Tests the complete integration:
- Fly Machine sends request to Edge Function
- Edge Function calls Gemini API
- Edge Function calculates key levels
- Response written to database
- All fields validated

**Tests:**
- Valid analysis generation
- Database write verification
- Minimal indicator handling

### 2. Error Recovery Tests
Verifies resilience:
- Missing authentication rejection
- Malformed request handling
- Gemini API error fallback
- Safe default responses

**Tests:**
- 401 on missing auth
- 400 on bad request
- Graceful degradation on errors

### 3. Rate Limiting & Concurrency Tests
Validates performance under load:
- Multiple concurrent requests
- Queue management
- Response time tracking

**Tests:**
- 5 concurrent requests
- Average latency measurement

### 4. Health Check Tests
Ensures monitoring endpoints work:
- GET /health endpoint
- Status reporting

## Test Data Cleanup

Tests automatically clean up after themselves by:
- Using `test-` prefix for all signal IDs
- Deleting test records in `afterAll()` hook

Manual cleanup if needed:
```sql
DELETE FROM signal_analyses WHERE signal_id LIKE 'test-%';
```

## Debugging Tests

### Enable verbose logging
```bash
DEBUG=* pnpm test
```

### Run a single test
```bash
pnpm test -t "should call Edge Function"
```

### Check test coverage
```bash
pnpm test --coverage
```

## Common Issues

### Tests timing out
- Increase timeout in `vitest.config.ts`
- Check if Edge Function is running
- Verify Gemini API key is valid

### Database connection errors
- Ensure Supabase is running
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
- Check if migration is applied

### Edge Function not responding
```bash
# Check if function is running
curl http://localhost:54321/functions/v1/ai-analysis/health

# Check function logs
supabase functions logs ai-analysis --tail
```

## CI/CD Integration

For GitHub Actions or other CI:

```yaml
env:
  SKIP_INTEGRATION_TESTS: true  # Skip unless test services available

# Or with test services:
steps:
  - name: Start Supabase
    run: supabase start

  - name: Deploy Edge Function
    run: supabase functions deploy ai-analysis

  - name: Run Tests
    run: pnpm test
    env:
      SUPABASE_URL: http://localhost:54321
      SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
```

## Writing New Tests

1. Add test to `tests/integration/ai-analysis.test.ts`
2. Use `test-` prefix for all test IDs
3. Clean up test data in `afterAll()`
4. Set appropriate timeout for slow operations
5. Check `SKIP_INTEGRATION_TESTS` flag

Example:
```typescript
it('should handle new scenario', async () => {
  if (TEST_CONFIG.skipIntegrationTests) return;

  const testRequest = {
    signalId: `test-signal-${Date.now()}`,
    // ... rest of request
  };

  // Make request and verify
}, 60000); // 60s timeout
```
