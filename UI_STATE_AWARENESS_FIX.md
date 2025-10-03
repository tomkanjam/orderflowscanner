# UI State Awareness Fix ✅

**Date:** 2025-10-03
**Issue:** UI doesn't show "starting" phase immediately after provisioning
**Status:** ✅ FIXED

---

## Problem

After clicking "Start Machine", the UI would show:
- "No machine found for user" (initially)
- Then eventually "Running" after a couple of minutes

The "starting" phase was completely invisible to the user, causing confusion.

### Symptoms
```
[CloudExecutionService] No machine found for user
[useCloudExecution] No machine found for user
[CloudExecution] Calling provision-machine...
[CloudExecution] Machine provisioned: vyx-63eea370
[CloudWebSocket] Connecting to wss://vyx-63eea370.fly.dev...
[CloudWebSocket] Error: Event {type: 'error', ...}  // Repeated failures
```

---

## Root Cause

**Flow was broken:**

1. User clicks "Start Machine" → `CloudExecutionPanel.handleStart()`
2. Edge Function provisions machine with status "starting" ✅
3. Panel gets response with `{machineId, websocketUrl, status: 'starting'}` ✅
4. **Panel tried to connect WebSocket immediately** ❌
   - WebSocket server not ready yet (machine still starting)
   - Multiple connection failures logged
5. **useCloudExecution hook NOT notified** of new machine state ❌
   - Hook only loads state on mount
   - Continues showing "No machine found"
6. Eventually polling (5s interval) picks up the change ✅
   - Hook updates to show "Running"

**Why WebSocket failed:**
The machine needs 10-15 seconds to start up and launch the WebSocket server. Trying to connect immediately while status is "starting" causes repeated connection failures.

**Why UI showed "No machine found":**
The `useCloudExecution` hook only fetches machine state on initial mount. When a machine is provisioned, the hook wasn't notified, so it kept showing stale state.

---

## The Fix

### Added Two New Methods to `useCloudExecution` Hook

**1. `setMachineProvisioned()` - For Start Flow**
```typescript
const setMachineProvisioned = useCallback((
  machineId: string,
  websocketUrl: string,
  status: MachineStatus,
  region: string
) => {
  console.log(`[useCloudExecution] Machine provisioned: ${machineId}, status: ${status}`);

  setState(prev => ({
    ...prev,
    machineId,
    websocketUrl,
    machineStatus: status,
    region,
    loading: false,
    error: null,
    lastFetchTimestamp: Date.now()
  }));

  // Start polling if in transitional state
  if (isTransitionalStatus(status)) {
    console.log(`[useCloudExecution] Starting poll for transitional state: ${status}`);
    startPolling();
  } else if (status === 'running') {
    // Auto-connect if already running
    cloudWebSocketClient.connect(machineId, websocketUrl, user?.id || '');
  }
}, [startPolling, user]);
```

**2. `setMachineStopping()` - For Stop Flow**
```typescript
const setMachineStopping = useCallback(() => {
  console.log('[useCloudExecution] Setting machine to stopping state');

  setState(prev => ({
    ...prev,
    machineStatus: 'stopping',
    lastFetchTimestamp: Date.now()
  }));

  // Start polling to track stopping -> stopped transition
  startPolling();
}, [startPolling]);
```

### Updated CloudExecutionPanel

**Start Machine (BEFORE - BROKEN):**
```typescript
const { machineId, websocketUrl, status: machineStatus } = response.data;
console.log('[CloudExecution] Machine provisioned:', machineId);

// ❌ Tries to connect immediately while machine is starting
cloudWebSocketClient.connect(machineId, websocketUrl, user.id);
```

**Start Machine (AFTER - FIXED):**
```typescript
const { machineId, websocketUrl, status: machineStatus } = response.data;
console.log('[CloudExecution] Machine provisioned:', machineId);

// ✅ Updates hook state immediately, starts polling
cloudExecution.setMachineProvisioned(
  machineId,
  websocketUrl,
  machineStatus,  // "starting"
  config.region
);
```

**Stop Machine (BEFORE - SUBOPTIMAL):**
```typescript
console.log('[CloudExecution] Machine stopped');

// Disconnect WebSocket
cloudWebSocketClient.disconnect();

// ❌ Status will be updated via database/WebSocket
// (relies on polling to pick up change)
setLoading(false);
```

**Stop Machine (AFTER - FIXED):**
```typescript
console.log('[CloudExecution] Machine stopping');

// ✅ Update hook state to 'stopping' and start polling
cloudExecution.setMachineStopping();

// Disconnect WebSocket
cloudWebSocketClient.disconnect();

setLoading(false);
```

---

## How It Works Now

### Start Machine Flow

1. **User clicks "Start Machine"** → `CloudExecutionPanel.handleStart()`

2. **Edge Function provisions machine**
   - Creates database record with status "starting"
   - Calls Fly.io API to create machine
   - Returns: `{machineId: 'vyx-63eea370', status: 'starting', websocketUrl: '...'}`

3. **Panel immediately updates hook** ✅
   ```typescript
   cloudExecution.setMachineProvisioned(machineId, websocketUrl, 'starting', region)
   ```

4. **Hook updates state** → UI shows "Starting..." ✅

5. **Hook starts polling** (every 5 seconds)
   - Checks database for status updates
   - Machine transitions: "starting" → "running"

6. **Polling detects "running" status** ✅
   - Hook stops polling (reached stable state)
   - Hook connects WebSocket automatically
   - UI shows "Running" ✅

### Stop Machine Flow

1. **User clicks "Stop Machine"** → `CloudExecutionPanel.handleStop()`

2. **Edge Function stops machine**
   - Updates database to status "stopping"
   - Calls Fly.io API to destroy machine

3. **Panel immediately updates hook** ✅
   ```typescript
   cloudExecution.setMachineStopping()
   ```

4. **Hook updates state** → UI shows "Stopping..." ✅

5. **Hook starts polling**
   - Machine transitions: "stopping" → "stopped"

6. **Polling detects "stopped"** ✅
   - Hook stops polling (reached stable state)
   - UI shows "Stopped" ✅

---

## Benefits

### ✅ Immediate UI Feedback
- User sees "Starting..." right after clicking start
- User sees "Stopping..." right after clicking stop
- No more "No machine found" confusion

### ✅ No Failed WebSocket Connections
- WebSocket only connects when status is "running"
- No more connection errors while machine is starting

### ✅ Smooth State Transitions
- Polling tracks transitional states automatically
- Stops polling when reaching stable state
- Auto-connects WebSocket when appropriate

### ✅ Better User Experience
- Clear visibility into machine lifecycle
- Loading indicators during transitions
- Automatic reconnection when machine becomes ready

---

## Files Modified

### 1. `apps/app/src/hooks/useCloudExecution.ts`
**Added methods:**
- `setMachineProvisioned()` - Updates state after provisioning, starts polling
- `setMachineStopping()` - Updates state to stopping, starts polling

**Exported in return:**
```typescript
return {
  ...state,
  isEliteTier,
  connect,
  disconnect,
  updateConfig,
  pauseExecution,
  resumeExecution,
  forceSync,
  retry,
  setMachineProvisioned,  // ✅ New
  setMachineStopping      // ✅ New
};
```

### 2. `apps/app/src/components/cloud/CloudExecutionPanel.tsx`

**handleStart() - Line 137:**
```typescript
// Changed from:
cloudWebSocketClient.connect(machineId, websocketUrl, user.id);

// To:
cloudExecution.setMachineProvisioned(
  machineId,
  websocketUrl,
  machineStatus,
  config.region
);
```

**handleStop() - Line 178:**
```typescript
// Added:
cloudExecution.setMachineStopping();
```

---

## Testing Guide

### Test Start Machine

1. **Navigate to Cloud Execution panel**
2. **Click "Start Machine"**

**Expected Behavior:**

**Immediately (< 1 second):**
- ✅ UI changes to "Starting..." with loading spinner
- ✅ No "No machine found" message
- ✅ No WebSocket connection errors in console

**After 10-15 seconds:**
- ✅ Status changes to "Running"
- ✅ WebSocket connects automatically
- ✅ Machine metrics appear

**Console logs:**
```
[CloudExecution] Calling provision-machine...
[CloudExecution] Machine provisioned: vyx-63eea370
[useCloudExecution] Machine provisioned: vyx-63eea370, status: starting
[useCloudExecution] Starting poll for transitional state: starting
[useCloudExecution] Poll: vyx-63eea370 is starting
[useCloudExecution] Poll: vyx-63eea370 is starting
[useCloudExecution] Poll: vyx-63eea370 is running
[useCloudExecution] Reached stable state, stopping poll
[CloudWebSocket] Connecting to wss://vyx-63eea370.fly.dev...
[CloudWebSocket] Connected successfully
```

### Test Stop Machine

1. **With machine running, click "Stop Machine"**

**Expected Behavior:**

**Immediately:**
- ✅ UI changes to "Stopping..." with loading spinner
- ✅ WebSocket disconnects

**After 5-10 seconds:**
- ✅ Status changes to "Stopped"
- ✅ Start button becomes available

---

## Edge Cases Handled

### Machine Already Running
If provisioning returns status "running" (shouldn't happen but handled):
```typescript
else if (status === 'running') {
  cloudWebSocketClient.connect(machineId, websocketUrl, user?.id || '');
}
```

### Polling Stops on Stable State
Polling automatically stops when status is no longer transitional:
```typescript
if (!isTransitionalStatus(machine.status)) {
  console.log('[useCloudExecution] Reached stable state, stopping poll');
  stopPolling();
}
```

### Auto-reconnect on Mount
If user refreshes page while machine is running:
```typescript
// In loadMachineState():
if (machine.status === 'running' && machine.websocket_url) {
  cloudWebSocketClient.connect(machine.machine_id, machine.websocket_url, user.id);
}
```

---

## Related Issues

This fix completes **Phase 3: Cloud Signal Display** from the Cloud Execution State Awareness feature:
- Issue: `issues/2025-10-02-cloud-execution-state-awareness.md`
- Previous work: Machine provisioning bugs (1-4)
- Related: WebSocket connection reliability

---

**Status:** 🚀 UI now provides immediate feedback and smooth state transitions!

**Test:** Provision a new machine to verify the complete flow works perfectly.
