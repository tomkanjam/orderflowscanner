# Browser Signal Persistence with Cloud Execution Guard

## Metadata
- **Status:** 🎯 idea
- **Created:** 2025-10-03T06:00:00Z
- **Updated:** 2025-10-03T06:00:00Z
- **Priority:** High
- **Type:** feature
- **Progress:** [          ] 0%

---

## Idea Review
*Stage: idea | Date: 2025-10-03T06:00:00Z*

### Original Idea
> "We need to persist browser signals. App needs to check if a machine is deployed before it is allowed to generate and persist signals. This is so that a trader is not generating duplicate signals and trades are not being managed by the browser and fly machine at the same time. Keep the scope tight."

### Enhanced Concept
Implement a **mutual exclusion system** that prevents concurrent signal generation and trade management between browser and cloud environments. This is a critical safety feature in trading systems to prevent:

1. **Duplicate Signal Generation**: Same trader triggering in both environments
2. **Conflicting Trade Management**: Two systems trying to manage the same position
3. **Double Order Execution**: Multiple orders for the same setup
4. **Position Sizing Errors**: Exceeding intended position sizes due to duplication

**Core Requirements:**
- Persist browser signals to database with `source='local'`
- Check cloud machine status before allowing browser signal generation
- Enforce single-environment execution per user (browser XOR cloud, never both)
- Provide clear user feedback about which environment is active
- Handle edge cases: machine provisioning, stopping, failures

### Target Users
- **Primary:** Elite tier users with cloud machines who want to avoid duplicate executions
- **Secondary:** Pro tier users in browser-only mode who need signal persistence
- **Edge Case:** Elite users during machine startup/shutdown transitions

### Domain Context
In **institutional trading systems**, this is called "execution arbitration" or "trade conflict prevention." Common patterns:

1. **Master-Slave Model**: One system (cloud) is authoritative, browser is read-only
2. **Token-Based Locking**: Whoever has the token can execute trades
3. **Health Check Heartbeats**: Active system broadcasts "I'm alive" signals
4. **Graceful Handoff**: Clean transition when switching execution environments

**Why This Matters Now:**
- Currently both environments can run simultaneously → duplicate signals
- No persistence in browser → users lose signal history on refresh
- Elite users paying for cloud execution but browser might interfere
- Trade management conflicts could lead to unexpected positions

**Similar Features in Competitor Products:**
- **TradingView**: Auto-trading disables when multiple connections detected
- **3Commas**: Single bot execution guarantee across devices
- **Binance Trading Bots**: Lock mechanism prevents multiple bot instances
- **MetaTrader**: Expert Advisor prevents duplicate positions with magic numbers

### Suggestions for Improvement

1. **Add Heartbeat Mechanism**
   - Cloud machine sends heartbeat every 10 seconds
   - Browser checks `last_health_check` timestamp
   - Consider machine "active" if heartbeat < 30 seconds old
   - **Why:** Handles machine failures gracefully without manual intervention

2. **Visual Status Indicator**
   - Prominent badge showing: "Cloud Active" or "Browser Mode"
   - Disable trader enable/disable toggle when cloud is running
   - Toast notification when cloud starts/stops
   - **Why:** Clear user feedback prevents confusion and accidental conflicts

3. **Grace Period During Transitions**
   - 30-second cooldown when machine stops before browser can activate
   - Prevents race condition during shutdown
   - **Why:** Machine might still be processing signals during shutdown

4. **Read-Only Mode for Browser When Cloud Active**
   - Browser can view signals but not generate new ones
   - Charts and analysis still work
   - **Why:** Users want to monitor even when cloud is running

### Critical Questions

#### Execution Arbitration Strategy
1. **Should browser be completely blocked or read-only when cloud is active?**
   - **Why it matters:** Read-only allows monitoring, blocked prevents any confusion
   - **Recommendation:** Read-only mode - users want visibility. Block only signal generation.
   - **Trading precedent:** Most platforms allow monitoring across devices but restrict execution to one instance

#### Machine Health Detection
2. **How do we detect if cloud machine is truly active vs stuck in 'starting' state?**
   - **Why it matters:** Machine could crash during startup, leaving database in 'starting' but not actually running
   - **Recommendation:** Combine status check with heartbeat freshness:
     - `status = 'running' AND last_health_check > NOW() - INTERVAL '30 seconds'`
   - **Trading precedent:** Health checks are standard in HFT systems - stale heartbeat = dead system

#### Signal Persistence Scope
3. **Do we persist ALL browser signals or only when browser is the active environment?**
   - **Why it matters:** Storage costs and data integrity
   - **Recommendation:** Only persist when browser is active environment (cloud not running)
   - **Reason:** If cloud is running, signals should only come from cloud. Browser shouldn't generate any.

#### Race Condition Handling
4. **What happens if cloud machine starts while browser is actively generating signals?**
   - **Why it matters:** Could have signals mid-processing when handoff occurs
   - **Recommendation:**
     - Browser polls machine status every 5 seconds
     - On detection of cloud start: immediately stop signal generation
     - Show toast: "Cloud machine started - switching to monitoring mode"
     - Any in-flight signals complete but no new ones start
   - **Trading precedent:** "Fail-safe" principle - always defer to more robust system (cloud)

#### Error State Recovery
5. **If cloud machine is in 'error' state, can browser take over?**
   - **Why it matters:** User shouldn't be blocked from trading if cloud fails
   - **Recommendation:** Yes, but with 2-minute delay and user confirmation
     - Check: `status = 'error' AND stopped_at > NOW() - INTERVAL '2 minutes'`
     - Show modal: "Cloud machine failed. Allow browser to take over? This will clear the error state."
     - **Why delay:** Ensures machine isn't just temporarily erroring and might recover
   - **Trading precedent:** Manual failover prevents flapping between systems

### Success Criteria
- [x] Browser checks machine status before generating signals
- [x] Browser persists signals with `source='local'` when active
- [x] No duplicate signals when cloud machine is running
- [x] Clear visual indicator of which environment is active
- [x] Graceful handling of machine start/stop transitions
- [x] Edge cases handled: machine errors, startup failures, network issues

### Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Race condition during cloud startup | High - Could generate duplicate signals | Poll status every 5s, immediate stop on detection, 30s grace period |
| Stale machine status (crashed but shows 'running') | High - Browser blocked when could be active | Use heartbeat freshness in addition to status check |
| Network latency causing status check delays | Medium - Brief window of duplicate signals | Acceptable - short window, can dedupe in database by symbol+trader+timestamp |
| User confusion about which mode is active | Medium - Manual errors | Prominent status badge, disable controls when read-only |
| Browser refresh during active signal generation | Low - In-flight signals lost | Acceptable for MVP - signals are real-time, fresh signals will come |
| Migration not applied | High - Feature won't work | Check migration status, provide clear error message |

### Recommended Next Steps
1. **Apply migration 013** - Ensure `source` and `machine_id` columns exist
2. **Implement machine status check hook** - `useCloudMachineStatus()`
3. **Add guard to signal generation** - Check status before creating signals
4. **Update SignalManager** - Persist signals to database with `source='local'`
5. **Add visual status indicator** - Badge showing active environment
6. **Test edge cases** - Machine start, stop, error, network failure

### Scope Definition (Keep Tight)

**IN SCOPE (MVP):**
✅ Check if cloud machine is running before browser generates signals
✅ Persist browser signals to database with `source='local'`
✅ Visual indicator showing which environment is active
✅ Prevent signal generation in browser when cloud is active
✅ Handle basic transitions (machine start/stop)

**OUT OF SCOPE (Future):**
❌ Per-trader execution control (all traders follow same rule)
❌ Automatic failover when cloud crashes
❌ Signal deduplication algorithms
❌ Historical signal migration
❌ Multi-machine support
❌ Manual override to force browser mode

### Priority Assessment
**Urgency:** High - Critical for Elite users with cloud machines
**Impact:** High - Prevents trading system conflicts and duplicate orders
**Effort:** M (Medium - 8-12 hours)
  - Apply migration: 0.5h
  - Machine status hook: 1h
  - Signal persistence: 2h
  - Guard logic: 2h
  - Visual indicator: 1h
  - Edge case handling: 2h
  - Testing: 2-3h

**Recommendation:** ✅ **Proceed immediately** - This is a safety-critical feature for production trading

**Trading System Risk Assessment:**
Without this feature, Elite users with cloud machines are at risk of:
- Duplicate signal generation
- Conflicting position management
- Unexpected position sizing
- Race conditions in order execution

In regulated trading environments, this would be classified as a **Severity 1** issue requiring immediate remediation.

---

## Implementation Notes

### Key Files to Modify
1. `apps/app/src/services/signalManager.ts` - Add database persistence
2. `apps/app/src/hooks/useCloudMachineStatus.ts` - New hook for status checking
3. `apps/app/src/hooks/useSignalLifecycle.ts` - Add guard before signal creation
4. `apps/app/src/components/cloud/CloudExecutionPanel.tsx` - Status indicator
5. `supabase/migrations/013_add_source_to_signals.sql` - Ensure applied

### Database Schema Requirements
```sql
-- From migration 013
ALTER TABLE signals ADD COLUMN source TEXT NOT NULL CHECK (source IN ('local', 'cloud'));
ALTER TABLE signals ADD COLUMN machine_id UUID REFERENCES cloud_machines(id);

-- Cloud machine health check
ALTER TABLE cloud_machines ADD COLUMN last_health_check TIMESTAMPTZ;
```

### Status Check Logic
```typescript
function canBrowserGenerateSignals(): boolean {
  // Check if cloud machine exists and is active
  const machine = await fetchMachineStatus(userId);

  if (!machine) return true; // No machine = browser can run

  // Check if machine is actually running with fresh heartbeat
  const isHealthy = machine.status === 'running'
    && machine.last_health_check
    && (Date.now() - new Date(machine.last_health_check).getTime()) < 30000;

  return !isHealthy; // Browser can run only if cloud is NOT healthy
}
```

---
*[End of idea review. Next: /spec issues/2025-10-03-browser-signal-persistence-with-cloud-guard.md]*
