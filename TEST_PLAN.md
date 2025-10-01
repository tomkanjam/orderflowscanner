# Cloud Execution UI Test Plan

## Prerequisites ✅

- [x] Database migration applied (`apply_cloud_migration.sql`)
- [ ] User tier set to 'elite' (run `set_elite_tier.sql`)
- [ ] App refreshed with hard reload (Ctrl+Shift+R or Cmd+Shift+R)

---

## Test 1: Elite Tier Access

**Goal:** Verify Elite tier features are visible

**Steps:**
1. Open browser console (F12)
2. Look for log: `[TraderList] Cloud execution state:`
3. Verify output shows:
   ```javascript
   {
     isEliteTier: true,        // ← Should be true
     currentTier: "elite",     // ← Should be "elite"
     machineStatus: "stopped", // ← Expected
     isConnected: false        // ← Expected (no machine yet)
   }
   ```

**Expected Results:**
- ✅ "Cloud Machine" button visible next to "+ Create"
- ✅ Cloud toggle icons visible on custom traders
- ✅ Cloud toggles are grayed out (machine not running)
- ✅ No "NOT ELITE" badges on custom traders

**If Failed:**
- Run `set_elite_tier.sql` to upgrade your account
- Hard refresh browser (Ctrl+Shift+R)

---

## Test 2: Cloud Machine Panel

**Goal:** Test machine control panel UI

**Steps:**
1. Click "Cloud Machine" button in "My AI Traders" section
2. Modal opens with CloudExecutionPanel

**Verify Panel Shows:**
- ✅ Header: "Cloud Execution"
- ✅ Status: "Stopped" with gray indicator
- ✅ Configuration section with:
  - Region dropdown (Singapore, US East, Europe)
  - CPU Priority dropdown (Low, Normal, High)
  - Push Notifications toggle
- ✅ "Start Machine" button (blue, enabled)

**Test Actions:**
- Click different regions → Selection updates
- Click different CPU priorities → Selection updates
- Toggle notifications → Switch changes
- Click X or outside modal → Panel closes

**Expected:** All UI controls work smoothly

---

## Test 3: Start Machine (Simulated)

**Goal:** Test machine provisioning flow

**Steps:**
1. Open Cloud Machine panel
2. Select "Singapore" region (closest to Binance)
3. Keep CPU Priority as "Normal"
4. Click "Start Machine"

**Expected Behavior:**
- ✅ Status changes: "Stopped" → "Provisioning" → "Starting" → "Running"
- ✅ Progress shows with spinning loader
- ✅ "Start Machine" button becomes disabled
- ✅ After ~5 seconds, status shows "Running"
- ✅ Metrics section appears with:
  - Active Signals: 0
  - Queue Depth: 0
  - CPU Usage: 0%
  - Memory Usage: 0%
- ✅ "Pause" and "Stop" buttons appear
- ✅ Uptime counter starts

**What Actually Happens:**
- Database record created in `cloud_machines` table
- Status updates via Edge Function
- WebSocket connection attempts (will fail gracefully - no Fly machine yet)
- UI simulates the running state

**Note:** Without Fly integration, machine won't *actually* provision, but UI demonstrates the full flow.

---

## Test 4: Cloud Toggle Activation

**Goal:** Verify cloud toggles become active when machine is "running"

**Steps:**
1. Start machine (Test 3)
2. Wait for status to show "Running"
3. Look at your custom traders (Stoch Reset & Go, Momentum Confluence Scalp)

**Expected Changes:**
- ✅ Cloud icons change from grayed out to active
- ✅ Hover shows tooltip: "Deploy to cloud"
- ✅ Icons become clickable

**Test Click:**
1. Click cloud icon on "Stoch Reset & Go"

**Expected:**
- ✅ Icon changes: CloudOff (gray) → Cloud (blue)
- ✅ "Cloud" badge appears next to "DEMO"
- ✅ Database updated: `cloud_config.enabledInCloud = true`
- ✅ Tooltip changes to "Deployed to cloud"

**Click Again:**
- ✅ Icon changes back: Cloud → CloudOff
- ✅ "Cloud" badge disappears
- ✅ Database updated: `cloud_config.enabledInCloud = false`

---

## Test 5: Multiple Traders

**Goal:** Deploy multiple traders to cloud

**Steps:**
1. Machine running (Test 3)
2. Click cloud toggle on "Stoch Reset & Go" → Deploys
3. Click cloud toggle on "Momentum Confluence Scalp" → Deploys

**Expected:**
- ✅ Both traders show Cloud icon (blue)
- ✅ Both traders show "Cloud" badge
- ✅ Active Signals metric stays 0 (no Fly machine yet)

**Verify Database:**
```sql
SELECT
  t.name,
  t.cloud_config->>'enabledInCloud' as deployed
FROM traders t
WHERE t.cloud_config->>'enabledInCloud' = 'true';
```

Should show both traders.

---

## Test 6: Stop Machine

**Goal:** Test machine shutdown flow

**Steps:**
1. Machine running with traders deployed (Test 5)
2. In Cloud Machine panel, click "Stop"

**Expected:**
- ✅ Status changes: "Running" → "Stopping" → "Stopped"
- ✅ Metrics section disappears
- ✅ Configuration section reappears
- ✅ "Start Machine" button reappears
- ✅ Cloud toggles on traders gray out again
- ✅ "Cloud" badges remain (deployment preference saved)

**Verify:**
- Cloud icons still show Cloud (blue) but grayed out
- Database still has `enabledInCloud: true` (preference saved)
- When machine restarts, traders auto-deploy

---

## Test 7: Error Handling

**Goal:** Verify error messages work

**Test Invalid Stop:**
1. Machine already stopped
2. Click "Stop" (shouldn't be visible, but test via console if possible)

**Expected:**
- ✅ Error message: "Machine is not running"
- ✅ Red error banner appears
- ✅ Status doesn't change

**Test Invalid Deploy:**
1. Machine stopped
2. Try to toggle cloud icon (should be disabled)

**Expected:**
- ✅ Toggle is grayed out
- ✅ Tooltip: "Start your cloud machine to enable"
- ✅ Click does nothing

---

## Test 8: Console Logs

**Goal:** Verify debugging logs work

**Steps:**
1. Open browser console (F12)
2. Navigate through app

**Look For:**
- ✅ `[TraderList] Cloud execution state:` on component mount
- ✅ `[SignalCard] <TraderName> - Cloud props:` for each custom trader
- ✅ `[CloudWebSocket] Connecting to ...` when machine starts
- ✅ `[CloudWebSocket] Error:` when connection fails (expected without Fly)
- ✅ `[CloudExecution] Machine provisioned:` when starting

**All logs should be clear and informative.**

---

## Test 9: Persistence

**Goal:** Verify state persists across refreshes

**Steps:**
1. Start machine
2. Deploy a trader
3. Refresh browser (F5)

**Expected After Refresh:**
- ✅ Machine status loads as "running" (from database)
- ✅ Trader still shows as deployed
- ✅ Cloud toggle shows Cloud icon (blue)
- ✅ "Cloud" badge visible

**Note:** Without Fly, machine won't *actually* be running, but database state persists.

---

## Test 10: Built-in Signals

**Goal:** Verify built-in signals don't show cloud controls

**Steps:**
1. Look at "1m Volatility Breakout Scalp" (built-in signal)

**Expected:**
- ✅ "BUILT-IN" badge visible (gray)
- ✅ NO cloud toggle icon
- ✅ This is expected - built-in signals don't support cloud execution

---

## Database Verification Queries

After testing, verify database state:

```sql
-- Check machine record
SELECT
  machine_id,
  status,
  region,
  created_at,
  started_at,
  stopped_at
FROM cloud_machines
ORDER BY created_at DESC
LIMIT 1;

-- Check deployed traders
SELECT
  name,
  cloud_config->>'enabledInCloud' as deployed,
  cloud_config->>'preferredRegion' as region,
  enabled
FROM traders
WHERE cloud_config->>'enabledInCloud' = 'true';

-- Check cloud events
SELECT
  event_type,
  timestamp,
  message,
  details
FROM cloud_events
ORDER BY timestamp DESC
LIMIT 10;
```

---

## Success Criteria ✅

**All Tests Pass:**
- [ ] Elite tier access verified
- [ ] Cloud Machine button visible
- [ ] Modal opens and closes correctly
- [ ] Machine start flow works (simulated)
- [ ] Cloud toggles activate when machine "running"
- [ ] Can deploy/undeploy traders
- [ ] Multiple traders can be deployed
- [ ] Machine stop flow works
- [ ] Error handling works correctly
- [ ] Console logs are clear
- [ ] State persists across refreshes
- [ ] Built-in signals don't show cloud controls
- [ ] Database records created correctly

**UI is Production-Ready:** ✅
**Backend Integration Needed:** Fly.io API (see `FLY_INTEGRATION_GUIDE.md`)

---

## What's Next?

After all tests pass, you have two options:

### Option A: Continue with UI Development
- UI is fully functional and tested
- Can develop other features
- Fly integration can be done later

### Option B: Complete Fly.io Integration
- Follow `FLY_INTEGRATION_GUIDE.md`
- 2-4 hours to implement
- Results in fully operational cloud execution

---

## Troubleshooting

**Cloud Machine button not visible:**
- Check console: `isEliteTier` should be `true`
- Run `set_elite_tier.sql` to upgrade
- Hard refresh (Ctrl+Shift+R)

**Cloud toggles grayed out:**
- Expected when machine is stopped
- Click "Cloud Machine" → "Start Machine"
- Wait for "Running" status

**Database errors:**
- Verify migration applied: `SELECT * FROM cloud_machines LIMIT 1;`
- Check RLS policies are created
- Verify user has proper permissions

**Console errors:**
- WebSocket connection failures are expected (no Fly machine yet)
- Should see graceful error handling
- UI should still be functional

---

## Test Report Template

After completing tests, document results:

```markdown
## Cloud Execution UI Test Report

**Date:** [Date]
**Tester:** [Your Name]
**Environment:** [Browser, OS]

### Tests Passed: X/10

1. Elite Tier Access: ✅/❌
2. Cloud Machine Panel: ✅/❌
3. Start Machine: ✅/❌
4. Cloud Toggle Activation: ✅/❌
5. Multiple Traders: ✅/❌
6. Stop Machine: ✅/❌
7. Error Handling: ✅/❌
8. Console Logs: ✅/❌
9. Persistence: ✅/❌
10. Built-in Signals: ✅/❌

### Issues Found:
- [List any issues]

### Screenshots:
- [Attach screenshots if needed]

### Notes:
- [Any additional observations]
```
