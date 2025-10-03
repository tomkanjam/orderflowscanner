# Fly.io Provisioning Logging Fix

**Date:** 2025-10-02
**Issue:** Silent failures in machine provisioning - database records created but Fly.io machines not provisioned
**Status:** ✅ FIXED

## Problem

The `provision-machine` Edge Function had a **silent simulation mode fallback** that would:
1. Create a database record with `status='provisioning'` ✓
2. Skip Fly.io API call if `FLY_API_TOKEN` was falsy ✗
3. Return a SUCCESS response with misleading message ✗
4. Leave machine stuck in `'provisioning'` state forever ✗

**This was completely unacceptable** - production failures should never fail silently!

## Changes Made

### 1. Added Comprehensive Logging

**Entry point logging:**
```typescript
console.log(`[${timestamp}] ========================================`);
console.log(`[${timestamp}] provision-machine invoked`);
console.log(`[${timestamp}] Method: ${req.method}`);
console.log(`[${timestamp}] Request: userId=${userId}, region=${region}, cpuPriority=${cpuPriority}`);
```

**Environment validation logging:**
```typescript
console.log(`[${timestamp}] Environment check:`);
console.log(`  - FLY_API_TOKEN: ${flyToken ? `EXISTS (length: ${flyToken.length})` : 'MISSING ❌'}`);
console.log(`  - FLY_APP_NAME: ${flyAppName}`);
console.log(`  - DOCKER_IMAGE: ${dockerImage}`);
```

**Fly.io API call logging:**
```typescript
console.log(`[${timestamp}] Calling Fly.io API to create machine in ${region}...`);
console.log(`[${timestamp}]   App: ${flyAppName}`);
console.log(`[${timestamp}]   Machine name: ${machine.machine_id}`);
console.log(`[${timestamp}]   Image: ${dockerImage}`);
console.log(`[${timestamp}] Fly.io API request body:`, JSON.stringify(requestBody, null, 2));
console.log(`[${timestamp}] Fly.io API response status: ${flyResponse.status} ${flyResponse.statusText}`);
console.log(`[${timestamp}] ✅ Fly machine created successfully:`, flyMachine.id);
```

**Error logging:**
```typescript
console.error(`[${timestamp}] ❌ Fly.io provisioning failed:`, flyError);
console.error(`[${timestamp}] Error details:`, {
  name: flyError instanceof Error ? flyError.name : 'Unknown',
  message: flyError instanceof Error ? flyError.message : String(flyError),
  stack: flyError instanceof Error ? flyError.stack : 'N/A',
});
```

### 2. Removed Silent Simulation Mode

**BEFORE:**
```typescript
} else {
  // FLY_API_TOKEN not set - return simulated response for development
  console.warn('FLY_API_TOKEN not set - running in simulation mode');

  return new Response(
    JSON.stringify({
      machineId: machine.machine_id,
      websocketUrl: machine.websocket_url,
      status: machine.status,  // Still 'provisioning' ❌
      message: `Machine provisioning initiated (simulation mode)` // Misleading! ❌
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

**AFTER:**
```typescript
if (!flyToken) {
  const errorMsg = 'FLY_API_TOKEN not configured - cannot provision Fly.io machine';
  console.error(`[${timestamp}] CRITICAL ERROR: ${errorMsg}`);

  // Update machine to error state
  await supabase
    .from('cloud_machines')
    .update({
      status: 'error',
      error_message: errorMsg,
    })
    .eq('id', machine.id);

  return new Response(
    JSON.stringify({
      error: errorMsg,
      message: 'Server configuration error - FLY_API_TOKEN missing',
      machineId: machine.machine_id,
    }),
    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

### 3. Enhanced Error Details

All error responses now include:
- Explicit error status codes (500)
- Detailed error messages
- Machine state updated to `'error'` in database
- Stack traces in logs
- Timestamp prefixes for chronological debugging

## Deployment

```bash
supabase functions deploy provision-machine
```

**Status:** ✅ Deployed successfully (Version 21)

## Testing Guide

To verify the fix works:

1. **Test with valid FLY_API_TOKEN:**
   ```bash
   # Call provision-machine endpoint
   # Should see detailed logs in Supabase Dashboard > Functions > provision-machine > Logs
   ```

2. **Check logs show:**
   - ✅ Entry point: "provision-machine invoked"
   - ✅ Environment check: "FLY_API_TOKEN: EXISTS (length: X)"
   - ✅ Fly.io API call: "Calling Fly.io API to create machine..."
   - ✅ Success: "✅ Fly machine created successfully: xyz"

3. **If provisioning fails, check logs show:**
   - ❌ Error details with full stack trace
   - ❌ Machine status updated to 'error' in database
   - ❌ HTTP 500 response returned (not 200!)

## Benefits

1. **No more silent failures** - All errors logged and reported
2. **Clear error messages** - Know exactly what went wrong
3. **Proper error states** - Machines marked as 'error' when they fail
4. **Debuggable** - Timestamps and detailed logging make issues traceable
5. **Production-ready** - Fails explicitly instead of silently

## Next Steps (Optional)

For even better observability:

1. **Add structured logging** - Use JSON format for log aggregation
2. **Add metrics** - Track success/failure rates
3. **Add alerting** - Notify on repeated provisioning failures
4. **Add health check endpoint** - Validate all required secrets are present

## Files Modified

- `supabase/functions/provision-machine/index.ts` - Added logging, removed simulation mode
- `LOGGING_FIX_SUMMARY.md` - This documentation

---

**Remember:** Production systems should NEVER fail silently. Always log, always report, always fail explicitly.
