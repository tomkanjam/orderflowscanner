# Fix Cloud Machine Provisioning - Reuse Existing Records

**Status**: 📊 planning
**Created**: 2025-10-02
**Priority**: High
**Domain**: Cloud Infrastructure / Database Management

---

## Idea Review
*Stage: idea-review | Date: 2025-10-02*

### Problem Statement

When Elite users attempt to provision a Fly.io cloud machine, the system fails with a database constraint violation if they have any previous machine record (regardless of status):

```
duplicate key value violates unique constraint "cloud_machines_machine_id_key"
```

**Current Behavior:**
1. User's previous machine failed with Docker image error
2. Database contains: `machine_id: "trademind-63eea370"` with `status: "error"`
3. User clicks "Start Machine" again
4. Edge Function generates same deterministic `machine_id` (based on userId)
5. INSERT fails due to UNIQUE constraint violation
6. User is blocked from provisioning

**Root Cause:**
The `provision-machine` Edge Function only checks for machines in active states (`['provisioning', 'starting', 'running']`) but doesn't handle machines in `error` or `stopped` states. Since `machine_id` is deterministically generated from `userId`, retrying always produces the same ID and violates the UNIQUE constraint.

### Business Impact

- **Elite users blocked** from using cloud execution after any failure
- **Poor user experience** - requires manual database cleanup
- **Support burden** - users must contact support to delete orphaned records
- **Deployment reliability** - any Fly.io API failure creates permanent blockage

### Design Intent Validation

**Schema Design (from migration 011):**
- `UNIQUE(user_id)` constraint → One machine per user intended ✓
- `UNIQUE(machine_id)` constraint → Prevents duplicate IDs ✓
- Records track lifecycle via `status` field ✓
- No automated cleanup/deletion logic ✗

**Intended Flow:**
Each Elite user should have exactly ONE machine record that transitions through states (`provisioning` → `starting` → `running` → `stopping` → `stopped` → `provisioning` again on restart).

**Current Flow:**
System creates new records instead of reusing existing ones, violating single-machine-per-user design.

### Proposed Solution

**Option 1: Reuse Existing Machine Records** ✓ RECOMMENDED

Modify `provision-machine` to:
1. Check for ANY existing machine record (all statuses)
2. If exists and not active (`error`, `stopped`):
   - UPDATE record to reset to `provisioning` state
   - Clear error fields
   - Update timestamps
   - Retry Fly.io provisioning
3. If exists and active (`provisioning`, `starting`, `running`):
   - Return existing machine info (current behavior)
4. If not exists:
   - INSERT new record (first-time provision)

**Benefits:**
- ✓ Maintains audit trail via version/updated_at
- ✓ Respects UNIQUE constraints design
- ✓ Aligns with one-machine-per-user intent
- ✓ No data deletion needed
- ✓ Handles retry scenarios gracefully

**Trade-offs:**
- Slightly more complex state transition logic
- Must handle concurrent provision attempts carefully

### User Stories

**As an Elite user**, when my cloud machine fails to provision, I want to retry provisioning without contacting support, so that I can quickly recover from transient failures.

**As an Elite user**, when I stop my cloud machine, I want to start it again later without creating duplicate database records, so that the system remains consistent.

**As a developer**, I want the provision logic to handle all machine states correctly, so that the single-machine-per-user design intent is maintained.

### Success Criteria

- [ ] Users can retry provisioning after failures without manual cleanup
- [ ] Each user has exactly ONE machine record at all times
- [ ] Error/stopped machines transition cleanly to provisioning state
- [ ] No duplicate key constraint violations occur
- [ ] Audit trail preserved via updated_at/version fields
- [ ] Concurrent provision requests handled safely

### Technical Scope

**Files to Modify:**
- `supabase/functions/provision-machine/index.ts` (lines 51-88)

**Database Schema:**
- No migration needed (existing constraints support this)

**Testing Needs:**
- Test retry after error state
- Test retry after stopped state
- Test concurrent provision attempts
- Test first-time provision (INSERT path)

### Related Issues

- `issues/2025-09-30-fly-machine-elite-trader-execution.md` - Original cloud execution feature
- Database migration: `supabase/migrations/011_create_cloud_execution_tables.sql`

### Open Questions

1. Should we limit retry attempts to prevent infinite loops?
2. Should we archive old error messages before clearing them?
3. How should we handle race conditions if user clicks Start twice rapidly?

---

## System Architecture
*Stage: architecture | Date: 2025-10-02*

### Executive Summary

Redesign the machine provisioning logic in `provision-machine` Edge Function to implement a proper state machine that reuses existing machine records instead of attempting to create new ones. This ensures each Elite user maintains exactly one machine record throughout its lifecycle, preventing duplicate key violations and aligning with the database schema's single-machine-per-user design.

### System Design

#### Data Models

**Machine State Transitions:**
```typescript
type MachineStatus =
  | 'provisioning'  // Initial state: creating Fly machine
  | 'starting'      // Fly machine created, booting up
  | 'running'       // Active and healthy
  | 'stopping'      // Shutting down gracefully
  | 'stopped'       // Fully stopped, can restart
  | 'error';        // Failed state, can retry

// Valid state transitions
type StateTransition = {
  from: MachineStatus[];
  to: MachineStatus;
  action: 'provision' | 'retry' | 'stop' | 'error' | 'recover';
};

const VALID_TRANSITIONS: StateTransition[] = [
  // First-time provision
  { from: [], to: 'provisioning', action: 'provision' },

  // Normal lifecycle
  { from: ['provisioning'], to: 'starting', action: 'provision' },
  { from: ['starting'], to: 'running', action: 'provision' },
  { from: ['running'], to: 'stopping', action: 'stop' },
  { from: ['stopping'], to: 'stopped', action: 'stop' },

  // Retry paths
  { from: ['stopped'], to: 'provisioning', action: 'retry' },
  { from: ['error'], to: 'provisioning', action: 'retry' },

  // Error paths
  { from: ['provisioning', 'starting'], to: 'error', action: 'error' },
];

interface CloudMachine {
  id: string;
  user_id: string;
  machine_id: string;  // Deterministic: `trademind-${userId.substring(0, 8)}`
  region: string;
  status: MachineStatus;
  cpus: number;
  memory_mb: number;

  // Connection
  websocket_url: string | null;
  health_check_url: string | null;

  // Lifecycle timestamps
  provisioned_at: string | null;
  started_at: string | null;
  stopped_at: string | null;
  last_health_check: string | null;

  // Error tracking
  error_message: string | null;
  error_count: number;

  // Metadata
  fly_app_name: string | null;
  fly_machine_version: string | null;
  created_at: string;
  updated_at: string;
}

interface ProvisionRequest {
  userId: string;
  userEmail?: string;  // For logging/debugging
  region?: 'sin' | 'iad' | 'fra';
  cpuPriority?: 'low' | 'normal' | 'high';
}

interface ProvisionResponse {
  machineId: string;
  websocketUrl: string;
  status: MachineStatus;
  flyMachineId?: string;  // Fly.io's internal ID
  message: string;
  wasReused?: boolean;  // Indicates if existing record was reused
}
```

#### Component Architecture

**Modified Services:**
- `supabase/functions/provision-machine/index.ts`: Complete state machine rewrite

**No UI changes required** - this is a backend fix

#### Service Layer

**Revised Provision Logic:**

```typescript
class MachineProvisioner {
  private supabase: SupabaseClient;
  private flyToken: string;
  private flyAppName: string;

  /**
   * Main entry point - handles all provision scenarios
   */
  async provision(request: ProvisionRequest): Promise<ProvisionResponse> {
    // 1. Get or prepare machine record
    const machine = await this.getOrPrepareMachine(request.userId, request.region);

    // 2. Attempt Fly.io provisioning
    const result = await this.provisionFlyMachine(machine, request);

    // 3. Update database with result
    await this.updateMachineState(machine.id, result);

    // 4. Log event
    await this.logProvisionEvent(machine, result);

    return this.formatResponse(machine, result);
  }

  /**
   * Gets existing machine or prepares new record
   * KEY LOGIC: Handles all state transitions for reuse
   */
  private async getOrPrepareMachine(
    userId: string,
    region: string
  ): Promise<CloudMachine> {
    // Check for ANY existing machine (all statuses)
    const { data: existing, error } = await this.supabase
      .from('cloud_machines')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();  // Returns null if not found, not an error

    if (error) throw error;

    const machineId = `trademind-${userId.substring(0, 8)}`;
    const websocketUrl = `wss://${machineId}.fly.dev`;

    // Case 1: No existing machine - first time provision
    if (!existing) {
      const { data: newMachine, error: insertError } = await this.supabase
        .from('cloud_machines')
        .insert({
          user_id: userId,
          machine_id: machineId,
          region: region,
          status: 'provisioning',
          websocket_url: websocketUrl,
          error_count: 0,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return newMachine;
    }

    // Case 2: Machine already active - return it
    if (['provisioning', 'starting', 'running'].includes(existing.status)) {
      return existing;  // Will be handled by caller
    }

    // Case 3: Machine in terminal state (stopped, error) - reuse record
    if (['stopped', 'error'].includes(existing.status)) {
      // Archive previous error if exists
      const previousError = existing.error_message
        ? { error: existing.error_message, timestamp: existing.updated_at }
        : null;

      const { data: updated, error: updateError } = await this.supabase
        .from('cloud_machines')
        .update({
          status: 'provisioning',
          region: region,  // Allow region change on retry
          error_message: null,  // Clear previous error
          provisioned_at: null,  // Reset lifecycle timestamps
          started_at: null,
          stopped_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) throw updateError;

      // Log retry event with previous error context
      if (previousError) {
        await this.logEvent({
          machine_id: existing.id,
          user_id: userId,
          event_type: 'machine_retry',
          severity: 'info',
          message: `Retrying provision after ${existing.status} state`,
          details: { previous_error: previousError },
        });
      }

      return updated;
    }

    // Case 4: Machine in stopping state - wait or error
    throw new Error(
      `Machine is currently stopping. Please wait for it to fully stop before restarting.`
    );
  }

  /**
   * Calls Fly.io API to provision/start machine
   */
  private async provisionFlyMachine(
    machine: CloudMachine,
    request: ProvisionRequest
  ): Promise<FlyProvisionResult> {
    // If machine already active, skip Fly.io call
    if (['running', 'starting'].includes(machine.status)) {
      return {
        success: true,
        status: machine.status,
        message: 'Machine already active',
        skipFlyCall: true,
      };
    }

    if (!this.flyToken) {
      // Development mode - simulate provision
      return {
        success: true,
        status: 'provisioning',
        message: 'Simulation mode (FLY_API_TOKEN not set)',
        simulated: true,
      };
    }

    try {
      const response = await fetch(
        `https://api.machines.dev/v1/apps/${this.flyAppName}/machines`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.flyToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: machine.machine_id,
            region: machine.region,
            config: {
              image: Deno.env.get('DOCKER_IMAGE') || 'registry.fly.io/trademind-cloud:latest',
              auto_destroy: true,
              restart: { policy: 'on-failure', max_retries: 3 },
              env: {
                USER_ID: request.userId,
                SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
                SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
                GEMINI_API_KEY: Deno.env.get('GEMINI_API_KEY') || '',
                CPU_PRIORITY: request.cpuPriority || 'normal',
              },
              services: [{
                ports: [
                  { port: 80, handlers: ['http'] },
                  { port: 443, handlers: ['tls', 'http'] },
                  { port: 8080, handlers: ['http'] },
                ],
                protocol: 'tcp',
                internal_port: 8080,
              }],
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Fly API error (${response.status}): ${errorText}`);
      }

      const flyMachine = await response.json();

      return {
        success: true,
        status: 'starting',
        flyMachineId: flyMachine.id,
        message: 'Machine provisioned successfully on Fly.io',
      };

    } catch (error) {
      return {
        success: false,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to provision machine on Fly.io',
      };
    }
  }

  /**
   * Updates machine record with provision result
   */
  private async updateMachineState(
    machineId: string,
    result: FlyProvisionResult
  ): Promise<void> {
    const updates: Partial<CloudMachine> = {
      status: result.status,
      updated_at: new Date().toISOString(),
    };

    if (result.success) {
      if (result.status === 'starting') {
        updates.started_at = new Date().toISOString();
        updates.error_count = 0;  // Reset on success
        updates.error_message = null;
      }
    } else {
      updates.error_message = result.error;
      // Increment error_count via SQL to avoid race conditions
      await this.supabase.rpc('increment_machine_error_count', {
        machine_id: machineId
      });
    }

    const { error } = await this.supabase
      .from('cloud_machines')
      .update(updates)
      .eq('id', machineId);

    if (error) {
      console.error('Failed to update machine state:', error);
      throw error;
    }
  }
}

interface FlyProvisionResult {
  success: boolean;
  status: MachineStatus;
  flyMachineId?: string;
  message: string;
  error?: string;
  simulated?: boolean;
  skipFlyCall?: boolean;
}
```

#### Data Flow

**Provision Flow (First Time):**
```
1. User clicks "Start Machine"
   └── CloudExecutionPanel.handleStart()
       └── supabase.functions.invoke('provision-machine')
           └── MachineProvisioner.provision()
               ├── getOrPrepareMachine(userId, region)
               │   ├── SELECT * FROM cloud_machines WHERE user_id = ?
               │   ├── Result: null (no existing record)
               │   └── INSERT new record with status='provisioning'
               ├── provisionFlyMachine(machine)
               │   ├── POST to Fly.io Machines API
               │   └── Return { success: true, flyMachineId, status: 'starting' }
               ├── updateMachineState(machineId, result)
               │   └── UPDATE status='starting', started_at=NOW()
               └── Return { machineId, websocketUrl, status: 'starting' }
```

**Provision Flow (Retry After Error):**
```
1. User clicks "Start Machine" (after previous failure)
   └── MachineProvisioner.provision()
       ├── getOrPrepareMachine(userId, region)
       │   ├── SELECT * FROM cloud_machines WHERE user_id = ?
       │   ├── Result: { status: 'error', error_message: '...' }
       │   ├── Archive previous error to cloud_events
       │   └── UPDATE status='provisioning', error_message=NULL, reset timestamps
       ├── provisionFlyMachine(machine)
       │   ├── POST to Fly.io (retry)
       │   └── Return result
       └── updateMachineState() and return
```

**Provision Flow (Already Running):**
```
1. User clicks "Start Machine" (machine already running)
   └── MachineProvisioner.provision()
       ├── getOrPrepareMachine(userId, region)
       │   ├── SELECT * FROM cloud_machines WHERE user_id = ?
       │   └── Result: { status: 'running' } - return as-is
       ├── provisionFlyMachine(machine)
       │   └── Skip Fly.io call (already active)
       └── Return { status: 'running', message: 'Machine already active' }
```

#### State Management

**Database State Transitions:**

| Current Status | User Action | New Status | Database Operation | Fly.io Action |
|---------------|-------------|------------|-------------------|---------------|
| (none) | Start | provisioning | INSERT | Create machine |
| provisioning | Start | provisioning | No-op | Return existing |
| starting | Start | starting | No-op | Return existing |
| running | Start | running | No-op | Return existing |
| stopped | Start | provisioning | UPDATE | Create machine |
| error | Start | provisioning | UPDATE + log retry | Create machine |
| stopping | Start | error | Reject | None (wait) |

**Concurrency Handling:**
- Use `UNIQUE(user_id)` constraint to prevent race conditions
- If concurrent requests attempt INSERT, one succeeds, others fail with constraint violation
- Failed requests retry with SELECT and find existing record
- State transitions use optimistic locking via `updated_at` timestamp

### Technical Specifications

#### API Contracts

**Request:**
```typescript
interface ProvisionRequest {
  userId: string;           // Required: user UUID
  userEmail?: string;       // Optional: for logging
  region?: 'sin' | 'iad' | 'fra';  // Default: 'sjc'
  cpuPriority?: 'low' | 'normal' | 'high';  // Default: 'normal'
}
```

**Success Response (200):**
```typescript
interface ProvisionResponse {
  machineId: string;        // e.g., "trademind-63eea370"
  websocketUrl: string;     // e.g., "wss://trademind-63eea370.fly.dev"
  status: MachineStatus;    // Current state
  flyMachineId?: string;    // Fly.io internal ID (if created)
  message: string;          // Human-readable status
  wasReused: boolean;       // True if existing record was updated
}
```

**Error Response (400, 403, 404, 500):**
```typescript
interface ErrorResponse {
  error: string;           // Error category
  message: string;         // Detailed message
  details?: string;        // Additional context
  machineId?: string;      // If machine exists but in bad state
}
```

#### Database Changes

**New Function (for atomic error count increment):**
```sql
CREATE OR REPLACE FUNCTION increment_machine_error_count(machine_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE cloud_machines
  SET error_count = error_count + 1, updated_at = NOW()
  WHERE id = machine_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Event Types Extended:**
```typescript
type CloudEventType =
  | 'machine_provisioned'      // First provision success
  | 'machine_started'          // Transitioned to running
  | 'machine_stopped'          // Graceful stop
  | 'machine_scaled'           // CPU/memory changed
  | 'machine_error'            // Error occurred
  | 'machine_retry'            // Retry after error/stopped ← NEW
  | 'config_synced'
  | 'trader_added'
  | 'trader_removed'
  | 'trader_updated'
  | 'signal_created'
  | 'analysis_completed'
  | 'websocket_connected'
  | 'websocket_disconnected'
  | 'health_check_failed';
```

### Integration Points

#### Existing Systems

**`provision-machine` Edge Function:**
- Entry point: `serve()` handler
- Authentication: Supabase service role key
- Authorization: Elite tier check via `user_subscriptions`
- Database: Direct Supabase client queries
- External API: Fly.io Machines API

**`stop-machine` Edge Function:**
- No changes needed (already uses correct state transitions)
- Updates machine to 'stopping' then 'stopped'

**Frontend `CloudExecutionPanel`:**
- No changes required
- Already handles different status responses
- Error handling in place for failures

### Non-Functional Requirements

#### Performance Targets

- **Response Time**: <500ms p95 (database lookups + Fly.io API)
- **Retry Success**: >95% of retries should succeed if Fly.io is healthy
- **Concurrency**: Handle 10 concurrent provision requests per user safely

#### Reliability

**Error Recovery:**
```typescript
// Idempotent operation - safe to retry
// If Fly.io call fails, database state allows immediate retry
// No orphaned records, no manual cleanup needed

// Retry strategy (in CloudExecutionPanel):
const retryConfig = {
  maxAttempts: 3,
  backoff: 'exponential',  // 1s, 2s, 4s
  retryOn: [500, 503],     // Server errors only
};
```

**Fallback:**
- If Fly.io API unavailable: Database record created with status='error'
- User can retry when Fly.io recovers
- No permanent blocking state

**Circuit Breaker:**
- If `error_count` > 5: Alert support (potential Fly.io outage)
- Show user: "Service temporarily unavailable, please try again later"

### Implementation Guidelines

#### Code Organization

```
supabase/functions/provision-machine/
  index.ts              # Main handler (refactored)
  machine-state.ts      # State machine logic (extracted)
  fly-client.ts         # Fly.io API wrapper (extracted)
  types.ts              # TypeScript interfaces
```

**Separation of Concerns:**
```typescript
// index.ts - HTTP handler
serve(async (req) => {
  const request = await parseRequest(req);
  await validateRequest(request);
  const provisioner = new MachineProvisioner(supabase);
  const result = await provisioner.provision(request);
  return formatResponse(result);
});

// machine-state.ts - State machine logic
class MachineStateMachine {
  canTransition(from: MachineStatus, to: MachineStatus): boolean
  getOrPrepareMachine(userId, region): Promise<CloudMachine>
  updateMachineState(machineId, updates): Promise<void>
}

// fly-client.ts - External API
class FlyMachinesClient {
  async createMachine(config): Promise<FlyMachine>
  async stopMachine(machineId): Promise<void>
  async getMachine(machineId): Promise<FlyMachine>
}
```

#### Error Handling

**Error Categories:**
```typescript
class ProvisionError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
  }
}

// Usage:
if (!subscription || subscription.tier !== 'elite') {
  throw new ProvisionError(
    'TIER_REQUIRED',
    'Elite tier required for cloud execution',
    403
  );
}

if (existing.status === 'stopping') {
  throw new ProvisionError(
    'STATE_CONFLICT',
    'Machine is currently stopping. Wait for it to fully stop.',
    409  // Conflict
  );
}
```

**Logging Strategy:**
```typescript
console.log(`[${timestamp}] [provision-machine] Action: ${action}, User: ${userId}`);

// Success:
console.log(`[${timestamp}] Machine provisioned: ${machineId}, Status: ${status}`);

// Error:
console.error(`[${timestamp}] Provision failed: ${error.message}`, {
  userId,
  machineId,
  status: existingMachine?.status,
  errorCount: existingMachine?.error_count,
});
```

### Security Considerations

#### Authorization

**No changes** - existing Elite tier check remains:
```typescript
const { data: subscription } = await supabase
  .from('user_subscriptions')
  .select('tier')
  .eq('user_id', userId)
  .single();

if (subscription?.tier !== 'elite') {
  throw new ProvisionError('TIER_REQUIRED', 'Elite tier required', 403);
}
```

#### Rate Limiting

**Current**: No rate limiting (Supabase edge functions have built-in limits)

**Recommendation**: Add user-level rate limit:
- Max 10 provision attempts per hour per user
- Prevents abuse/infinite retry loops
- Track via `cloud_events` table (count `machine_retry` events)

### Deployment Considerations

#### Configuration

**No new environment variables needed**

Existing config sufficient:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FLY_API_TOKEN`
- `FLY_APP_NAME`
- `DOCKER_IMAGE`
- `GEMINI_API_KEY`

#### Migration Strategy

**Database Migration:**
```sql
-- Add helper function
CREATE OR REPLACE FUNCTION increment_machine_error_count(p_machine_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE cloud_machines
  SET
    error_count = error_count + 1,
    updated_at = NOW()
  WHERE id = p_machine_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update cloud_events CHECK constraint to include new event type
ALTER TABLE cloud_events DROP CONSTRAINT IF EXISTS cloud_events_event_type_check;
ALTER TABLE cloud_events ADD CONSTRAINT cloud_events_event_type_check
  CHECK (event_type IN (
    'machine_provisioned', 'machine_started', 'machine_stopped',
    'machine_scaled', 'machine_error', 'machine_retry',  -- Added
    'config_synced', 'trader_added', 'trader_removed', 'trader_updated',
    'signal_created', 'analysis_completed',
    'websocket_connected', 'websocket_disconnected', 'health_check_failed'
  ));
```

**Code Deployment:**
1. Deploy database migration first
2. Deploy updated Edge Function (backward compatible)
3. No frontend changes needed
4. Rollback: Revert Edge Function if issues (database migration is additive)

#### Monitoring

**Metrics to Track:**
```typescript
// In cloud_events:
- Count of 'machine_retry' events per user (detect retry loops)
- Count of 'machine_error' events per hour (detect Fly.io outages)
- Time between 'machine_retry' and 'machine_started' (measure recovery time)

// In cloud_machines:
- AVG(error_count) across all users (health indicator)
- Count of machines stuck in 'provisioning' > 5 minutes (stale states)
```

**Alerts:**
- If any user has `error_count` > 5: Investigate Fly.io or Docker image
- If >10 'machine_error' events in 1 hour: Potential outage
- If machine in 'provisioning' > 5 minutes: Stuck state, manual intervention

### Testing Strategy

#### Test Coverage Requirements

**Unit Tests (provision-machine logic):**
- State transitions (all valid paths)
- Error handling (constraint violations, Fly.io failures)
- Retry logic (reusing stopped/error machines)

**Integration Tests:**
- Full provision flow with real Supabase (test project)
- Concurrent provision attempts (verify UNIQUE constraint handling)
- Retry after error/stopped states

**E2E Tests:**
- User flow: Start → Error → Retry → Success
- User flow: Start → Stop → Restart
- User flow: Double-click Start (concurrent requests)

#### Test Scenarios

**Happy Path:**
```typescript
describe('First-time provision', () => {
  it('should create new machine record', async () => {
    const result = await provision({ userId: 'test-user-1', region: 'sin' });
    expect(result.status).toBe('starting');
    expect(result.wasReused).toBe(false);

    const machine = await getMachine('test-user-1');
    expect(machine.status).toBe('starting');
    expect(machine.error_count).toBe(0);
  });
});
```

**Retry Paths:**
```typescript
describe('Retry after error', () => {
  beforeEach(async () => {
    // Create machine in error state
    await createMachine({ userId: 'test-user-2', status: 'error' });
  });

  it('should reuse existing record and clear error', async () => {
    const result = await provision({ userId: 'test-user-2', region: 'sin' });
    expect(result.wasReused).toBe(true);

    const machine = await getMachine('test-user-2');
    expect(machine.error_message).toBeNull();
    expect(machine.status).toBe('starting');
  });

  it('should log retry event', async () => {
    await provision({ userId: 'test-user-2', region: 'sin' });

    const events = await getEvents('test-user-2', 'machine_retry');
    expect(events).toHaveLength(1);
    expect(events[0].details.previous_error).toBeDefined();
  });
});

describe('Concurrent provisions', () => {
  it('should handle race condition gracefully', async () => {
    const promises = [
      provision({ userId: 'test-user-3', region: 'sin' }),
      provision({ userId: 'test-user-3', region: 'sin' }),
    ];

    const results = await Promise.allSettled(promises);
    const succeeded = results.filter(r => r.status === 'fulfilled');

    // Both should succeed (one INSERT, one finds existing)
    expect(succeeded).toHaveLength(2);

    // Should only have one machine record
    const machines = await getMachines('test-user-3');
    expect(machines).toHaveLength(1);
  });
});
```

**Error Cases:**
```typescript
describe('Invalid states', () => {
  it('should reject provision while stopping', async () => {
    await createMachine({ userId: 'test-user-4', status: 'stopping' });

    await expect(
      provision({ userId: 'test-user-4', region: 'sin' })
    ).rejects.toThrow('currently stopping');
  });
});
```

### Decision Log

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| **Reuse existing records via UPDATE** | Maintains audit trail, respects UNIQUE constraints, aligns with schema design | DELETE then INSERT (loses history), Generate unique IDs per attempt (violates schema) |
| **Use `.maybeSingle()` instead of `.single()`** | Differentiates between "no record" (null) and query error (exception) | `.single()` with error handling (less clear intent) |
| **Archive previous errors in events** | Preserves debugging context when retrying | Clear errors silently (loses troubleshooting data) |
| **Reject provisions during 'stopping'** | Prevents race condition between stop and start | Allow provision (could cause Fly.io conflicts) |
| **Extract state machine logic to class** | Testable, maintainable, clear separation of concerns | Keep inline in handler (harder to test) |

### Open Technical Questions

1. **Should we limit retry attempts?**
   - Proposal: After 5 consecutive errors, require manual intervention
   - Implementation: Check `error_count` before allowing retry
   - PM Decision: ?

2. **Should we archive old error messages?**
   - Current: Clear `error_message` on retry
   - Proposal: Store previous errors in JSON array `error_history`
   - Trade-off: More complete debugging vs. database bloat
   - PM Decision: Current approach (archive to events) is sufficient

3. **How to handle region changes on retry?**
   - Current: Allow region change when retrying
   - Alternative: Enforce same region for machine lifetime
   - PM Decision: ?

### Success Criteria

- [x] Architecture designed for state machine reuse
- [ ] Users can retry provisioning after failures without manual cleanup
- [ ] Each user has exactly ONE machine record at all times
- [ ] Error/stopped machines transition cleanly to provisioning state
- [ ] No duplicate key constraint violations occur
- [ ] Audit trail preserved via cloud_events and updated_at
- [ ] Concurrent provision requests handled safely via UNIQUE constraint
- [ ] Test coverage >80% for provision logic

---

## Implementation Plan
*Stage: planning | Date: 2025-10-02*

### Overview

This is a **backend-only fix** with no UI changes. We'll refactor the `provision-machine` Edge Function to implement proper state machine logic that reuses existing machine records instead of attempting to create duplicates. The fix addresses the root cause by checking for machines in ALL states (not just active ones) and using UPDATE instead of INSERT for machines in terminal states (`error`, `stopped`).

**Key Changes:**
1. Replace `.in('status', ['provisioning', 'starting', 'running'])` with check for ANY machine
2. Add logic to UPDATE existing records when status is `error` or `stopped`
3. Add database migration for helper function and new event type
4. Archive previous errors to `cloud_events` for debugging
5. Handle edge case: reject provision when status is `stopping`

### Prerequisites

- [x] Supabase project access (project ID: `jtpqkbybuxbcvqeffmtf`)
- [x] Understanding of cloud_machines schema constraints
- [x] Knowledge of Fly.io Machines API (for testing)
- [ ] Supabase CLI installed and linked
- [ ] Local Supabase instance running (optional, for testing)

### Implementation Phases

#### Phase 1: Database Migration (30 minutes)
**Objective:** Add helper function and extend event types

##### Task 1.1: Create Migration File (15 min)
Files to create:
- `supabase/migrations/012_cloud_machine_reuse_support.sql`

Actions:
- [ ] Create new migration file with timestamp
- [ ] Add `increment_machine_error_count()` function
- [ ] Update `cloud_events.event_type` CHECK constraint to include `'machine_retry'`
- [ ] Add comments for documentation

Migration content:
```sql
-- ============================================================================
-- Cloud Machine Reuse Support
-- ============================================================================
-- Purpose: Add helper function and event type for machine record reuse
-- Related Issue: issues/2025-10-02-fix-cloud-machine-reuse.md
-- ============================================================================

-- Helper function for atomic error count increment
CREATE OR REPLACE FUNCTION increment_machine_error_count(p_machine_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE cloud_machines
  SET
    error_count = error_count + 1,
    updated_at = NOW()
  WHERE id = p_machine_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_machine_error_count IS 'Atomically increments error_count for a machine to avoid race conditions';

-- Extend cloud_events event_type constraint to include retry event
ALTER TABLE cloud_events DROP CONSTRAINT IF EXISTS cloud_events_event_type_check;
ALTER TABLE cloud_events ADD CONSTRAINT cloud_events_event_type_check
  CHECK (event_type IN (
    'machine_provisioned',
    'machine_started',
    'machine_stopped',
    'machine_scaled',
    'machine_error',
    'machine_retry',  -- NEW: For retry after error/stopped
    'config_synced',
    'trader_added',
    'trader_removed',
    'trader_updated',
    'signal_created',
    'analysis_completed',
    'websocket_connected',
    'websocket_disconnected',
    'health_check_failed'
  ));

-- ============================================================================
-- Migration Complete
-- ============================================================================
```

Test criteria:
- [ ] Migration file created with proper timestamp
- [ ] SQL syntax is valid (no errors)
- [ ] Function can be called successfully
- [ ] Event type constraint includes 'machine_retry'

**Checkpoint:** Migration file ready for deployment

##### Task 1.2: Deploy Migration (15 min)
Commands to run:
```bash
# Link to Supabase project
supabase link --project-ref jtpqkbybuxbcvqeffmtf

# Apply migration to remote
supabase db push

# Verify migration applied
supabase db diff
```

Actions:
- [ ] Link Supabase CLI to project
- [ ] Push migration to remote database
- [ ] Verify function exists in database
- [ ] Test function manually with SQL query

Manual test query:
```sql
-- Create test machine record
INSERT INTO cloud_machines (user_id, machine_id, region, status, error_count)
VALUES ('00000000-0000-0000-0000-000000000001', 'test-machine', 'sin', 'error', 0)
RETURNING id;

-- Test increment function (replace with actual UUID)
SELECT increment_machine_error_count('UUID-from-above');

-- Verify error_count incremented
SELECT error_count FROM cloud_machines WHERE machine_id = 'test-machine';
-- Should return 1

-- Cleanup
DELETE FROM cloud_machines WHERE machine_id = 'test-machine';
```

Test criteria:
- [ ] Migration applied without errors
- [ ] Function exists in database
- [ ] Function increments error_count correctly
- [ ] New event type accepted in cloud_events

**Phase 1 Complete When:**
- Migration deployed to production
- Helper function verified working
- Event type constraint updated
- No errors in database logs

---

#### Phase 2: Refactor Provision Logic (2 hours)
**Objective:** Implement state machine with record reuse

##### Task 2.1: Replace Machine Lookup Logic (30 min)
File to modify:
- `supabase/functions/provision-machine/index.ts`

**Current code (lines 50-69):**
```typescript
// Check for existing running machine
const { data: existing } = await supabase
  .from('cloud_machines')
  .select('*')
  .eq('user_id', userId)
  .in('status', ['provisioning', 'starting', 'running'])
  .single();

if (existing) {
  console.log('Existing machine found:', existing.machine_id);
  return new Response(
    JSON.stringify({
      machineId: existing.machine_id,
      websocketUrl: existing.websocket_url,
      status: existing.status,
      message: 'Machine already running'
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

**New code:**
```typescript
// Check for ANY existing machine (all statuses)
const { data: existing, error: existingError } = await supabase
  .from('cloud_machines')
  .select('*')
  .eq('user_id', userId)
  .maybeSingle();  // Returns null if not found, not an error

if (existingError) {
  console.error('Error checking for existing machine:', existingError);
  return new Response(
    JSON.stringify({ error: 'Failed to check existing machine', details: existingError.message }),
    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Machine already active - return it
if (existing && ['provisioning', 'starting', 'running'].includes(existing.status)) {
  console.log(`[${new Date().toISOString()}] Existing active machine found:`, existing.machine_id, existing.status);
  return new Response(
    JSON.stringify({
      machineId: existing.machine_id,
      websocketUrl: existing.websocket_url,
      status: existing.status,
      message: 'Machine already active'
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Machine in stopping state - reject with clear error
if (existing && existing.status === 'stopping') {
  console.warn(`[${new Date().toISOString()}] Machine is stopping, cannot provision:`, existing.machine_id);
  return new Response(
    JSON.stringify({
      error: 'Machine is currently stopping',
      message: 'Please wait for the machine to fully stop before restarting.',
      machineId: existing.machine_id,
      status: existing.status
    }),
    { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

Actions:
- [ ] Replace `.single()` with `.maybeSingle()`
- [ ] Add error handling for database query
- [ ] Check for active machines first (unchanged behavior)
- [ ] Add handling for 'stopping' state (new edge case)
- [ ] Add timestamps to all console logs

Test criteria:
- [ ] Returns existing machine if active
- [ ] Rejects with 409 if stopping
- [ ] Continues to next logic if no machine or terminal state
- [ ] Logs include timestamps

**Checkpoint:** Machine lookup handles all states correctly

##### Task 2.2: Add Machine Reuse Logic (45 min)
File to modify:
- `supabase/functions/provision-machine/index.ts` (insert after Task 2.1 code, before line 71)

**New code to insert:**
```typescript
// Machine in terminal state (stopped, error) - reuse record
if (existing && ['stopped', 'error'].includes(existing.status)) {
  console.log(`[${new Date().toISOString()}] Reusing existing machine in ${existing.status} state:`, existing.machine_id);

  // Archive previous error if exists
  if (existing.error_message) {
    const previousError = {
      error: existing.error_message,
      error_count: existing.error_count,
      timestamp: existing.updated_at
    };

    // Log retry event with context
    await supabase
      .from('cloud_events')
      .insert({
        machine_id: existing.machine_id,
        user_id: userId,
        event_type: 'machine_retry',
        severity: 'info',
        message: `Retrying provision after ${existing.status} state`,
        details: { previous_error: previousError, region },
      });

    console.log(`[${new Date().toISOString()}] Archived previous error to cloud_events`);
  }

  // Reset machine to provisioning state
  const { data: resetMachine, error: updateError } = await supabase
    .from('cloud_machines')
    .update({
      status: 'provisioning',
      region: region,  // Allow region change on retry
      error_message: null,  // Clear previous error
      provisioned_at: null,  // Reset lifecycle timestamps
      started_at: null,
      stopped_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select()
    .single();

  if (updateError) {
    console.error(`[${new Date().toISOString()}] Failed to reset machine:`, updateError);
    return new Response(
      JSON.stringify({ error: 'Failed to reset machine record', details: updateError.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`[${new Date().toISOString()}] Machine reset to provisioning state:`, resetMachine.machine_id);

  // Continue with Fly.io provisioning using resetMachine
  // Set a variable so the Fly.io logic knows this is a reused record
  const machine = resetMachine;
  const wasReused = true;

  // Jump to Fly.io provisioning (line 98+)
  // We'll modify the response to include wasReused flag
}
```

Actions:
- [ ] Add check for terminal states (stopped, error)
- [ ] Archive previous error to cloud_events with 'machine_retry' type
- [ ] UPDATE machine record to reset to provisioning state
- [ ] Clear error fields and reset timestamps
- [ ] Allow region change on retry
- [ ] Set flag to indicate record was reused
- [ ] Add comprehensive logging with timestamps

Test criteria:
- [ ] Machines in 'error' state are reused
- [ ] Machines in 'stopped' state are reused
- [ ] Previous errors archived to cloud_events
- [ ] Machine status reset to 'provisioning'
- [ ] Error fields cleared
- [ ] Timestamps reset correctly

**Checkpoint:** Terminal state machines are properly reused

##### Task 2.3: Modify INSERT Logic for First-Time Provision (15 min)
File to modify:
- `supabase/functions/provision-machine/index.ts` (lines 71-96)

**Current code:**
```typescript
// Generate machine ID
const machineId = `trademind-${userId.substring(0, 8)}`;
const websocketUrl = `wss://${machineId}.fly.dev`;

// For now, create database record in "provisioning" state
const { data: machine, error: insertError } = await supabase
  .from('cloud_machines')
  .insert({
    user_id: userId,
    machine_id: machineId,
    region: region,
    status: 'provisioning',
    websocket_url: websocketUrl,
    created_at: new Date().toISOString()
  })
  .select()
  .single();
```

**Modified code:**
```typescript
// Only reach here if no existing machine (first-time provision)
const machineId = `trademind-${userId.substring(0, 8)}`;
const websocketUrl = `wss://${machineId}.fly.dev`;

console.log(`[${new Date().toISOString()}] First-time provision for user ${userId}, creating new machine:`, machineId);

// Create database record in "provisioning" state
const { data: machine, error: insertError } = await supabase
  .from('cloud_machines')
  .insert({
    user_id: userId,
    machine_id: machineId,
    region: region,
    status: 'provisioning',
    websocket_url: websocketUrl,
    error_count: 0,  // Initialize error count
  })
  .select()
  .single();

const wasReused = false;  // First-time provision
```

Actions:
- [ ] Add comment explaining this path is first-time only
- [ ] Add logging with timestamp
- [ ] Initialize error_count to 0 explicitly
- [ ] Remove manual created_at (use default)
- [ ] Set wasReused flag to false

Test criteria:
- [ ] INSERT only happens when no existing machine
- [ ] error_count initialized to 0
- [ ] Log clearly indicates first-time provision

**Checkpoint:** First-time provision path clearly separated

##### Task 2.4: Update Response to Include wasReused Flag (15 min)
File to modify:
- `supabase/functions/provision-machine/index.ts` (lines 178-186, 227-234)

**Current response (success):**
```typescript
return new Response(
  JSON.stringify({
    machineId: machine.machine_id,
    websocketUrl: machine.websocket_url,
    status: 'starting',
    flyMachineId: flyMachine.id,
    message: 'Machine provisioned successfully on Fly.io'
  }),
  { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
);
```

**Modified response:**
```typescript
return new Response(
  JSON.stringify({
    machineId: machine.machine_id,
    websocketUrl: machine.websocket_url,
    status: 'starting',
    flyMachineId: flyMachine.id,
    wasReused: wasReused,  // NEW: Indicates if existing record was reused
    message: wasReused
      ? 'Machine restarted successfully on Fly.io'
      : 'Machine provisioned successfully on Fly.io'
  }),
  { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
);
```

Also update simulation mode response (line 227-234):
```typescript
return new Response(
  JSON.stringify({
    machineId: machine.machine_id,
    websocketUrl: machine.websocket_url,
    status: machine.status,
    wasReused: wasReused,  // NEW
    message: `Machine ${wasReused ? 'restarted' : 'provisioning initiated'} (simulation mode - FLY_API_TOKEN not set)`
  }),
  { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
);
```

Actions:
- [ ] Add wasReused flag to success response
- [ ] Customize message based on wasReused
- [ ] Add wasReused to simulation response
- [ ] Update TypeScript interface if needed

Test criteria:
- [ ] Response includes wasReused boolean
- [ ] Message differs for reused vs new machines
- [ ] Simulation mode also includes flag

**Checkpoint:** API responses clearly indicate reuse status

##### Task 2.5: Use Helper Function for Error Count (15 min)
File to modify:
- `supabase/functions/provision-machine/index.ts` (line 198)

**Current code:**
```typescript
await supabase
  .from('cloud_machines')
  .update({
    status: 'error',
    error_message: flyError instanceof Error ? flyError.message : 'Fly.io provisioning failed',
    error_count: 1,
  })
  .eq('id', machine.id);
```

**Modified code:**
```typescript
await supabase
  .from('cloud_machines')
  .update({
    status: 'error',
    error_message: flyError instanceof Error ? flyError.message : 'Fly.io provisioning failed',
  })
  .eq('id', machine.id);

// Increment error_count atomically
await supabase.rpc('increment_machine_error_count', {
  p_machine_id: machine.id
});

console.log(`[${new Date().toISOString()}] Machine marked as error, error_count incremented`);
```

Actions:
- [ ] Remove error_count from UPDATE
- [ ] Add call to increment_machine_error_count RPC
- [ ] Add logging for error count increment
- [ ] Handle potential RPC errors gracefully

Test criteria:
- [ ] error_count increments on error
- [ ] Atomic operation prevents race conditions
- [ ] Logs confirm increment happened

**Phase 2 Complete When:**
- All machine states handled correctly
- Record reuse logic working
- First-time provision still works
- Error handling comprehensive
- All console logs include timestamps
- TypeScript compiles without errors

---

#### Phase 3: Testing & Validation (1.5 hours)
**Objective:** Verify all scenarios work correctly

##### Task 3.1: Test First-Time Provision (15 min)
Test scenario: User with no existing machine

Setup:
```sql
-- Ensure test user has no machine
DELETE FROM cloud_machines WHERE user_id = '63eea370-27a1-4099-866a-e3ed340b278d';
```

Actions:
- [ ] Call provision-machine endpoint with test userId
- [ ] Verify INSERT creates new record
- [ ] Check response has wasReused: false
- [ ] Verify machine_id matches expected format
- [ ] Check status is 'provisioning' or 'starting'

Expected results:
```json
{
  "machineId": "trademind-63eea370",
  "websocketUrl": "wss://trademind-63eea370.fly.dev",
  "status": "provisioning",  // or "starting" if Fly.io succeeds
  "wasReused": false,
  "message": "Machine provisioning initiated..."
}
```

Database check:
```sql
SELECT * FROM cloud_machines WHERE user_id = '63eea370-27a1-4099-866a-e3ed340b278d';
-- Should have exactly 1 record with status 'provisioning' or 'starting'
```

Test criteria:
- [ ] New record created via INSERT
- [ ] wasReused is false
- [ ] Exactly one machine record exists
- [ ] No duplicate key errors

**Checkpoint:** First-time provision works

##### Task 3.2: Test Retry After Error (20 min)
Test scenario: User's previous provision failed

Setup:
```sql
-- Create machine in error state
UPDATE cloud_machines
SET
  status = 'error',
  error_message = 'Fly API error: Docker image not found',
  error_count = 1
WHERE user_id = '63eea370-27a1-4099-866a-e3ed340b278d';
```

Actions:
- [ ] Call provision-machine endpoint again
- [ ] Verify UPDATE reuses existing record
- [ ] Check wasReused: true in response
- [ ] Verify error_message cleared
- [ ] Check cloud_events has 'machine_retry' event

Expected results:
```json
{
  "machineId": "trademind-63eea370",
  "websocketUrl": "wss://trademind-63eea370.fly.dev",
  "status": "starting",
  "wasReused": true,
  "message": "Machine restarted successfully on Fly.io"
}
```

Database checks:
```sql
-- Machine record should be updated, not inserted
SELECT status, error_message, error_count, updated_at
FROM cloud_machines
WHERE user_id = '63eea370-27a1-4099-866a-e3ed340b278d';
-- status should be 'starting', error_message NULL, error_count 1 (preserved)

-- Check retry event logged
SELECT * FROM cloud_events
WHERE user_id = '63eea370-27a1-4099-866a-e3ed340b278d'
  AND event_type = 'machine_retry'
ORDER BY created_at DESC
LIMIT 1;
-- Should have details.previous_error with archived error
```

Test criteria:
- [ ] Existing record updated (not new INSERT)
- [ ] wasReused is true
- [ ] error_message cleared
- [ ] error_count preserved (not reset)
- [ ] cloud_events has retry event with previous error
- [ ] Still exactly one machine record

**Checkpoint:** Retry after error works

##### Task 3.3: Test Retry After Stopped (15 min)
Test scenario: User stopped their machine and wants to restart

Setup:
```sql
UPDATE cloud_machines
SET
  status = 'stopped',
  error_message = NULL,
  stopped_at = NOW()
WHERE user_id = '63eea370-27a1-4099-866a-e3ed340b278d';
```

Actions:
- [ ] Call provision-machine endpoint
- [ ] Verify machine reused
- [ ] Check wasReused: true
- [ ] Verify stopped_at cleared

Expected results:
- Same as Task 3.2 (reused machine)
- No error in cloud_events (stopped is not an error state)

Test criteria:
- [ ] Machine reused from stopped state
- [ ] Timestamps reset correctly
- [ ] No retry event logged (stopped is normal, not error)

**Checkpoint:** Restart after stop works

##### Task 3.4: Test Already Active Machine (10 min)
Test scenario: User clicks provision while machine already running

Setup:
```sql
UPDATE cloud_machines
SET status = 'running'
WHERE user_id = '63eea370-27a1-4099-866a-e3ed340b278d';
```

Actions:
- [ ] Call provision-machine endpoint
- [ ] Verify no database changes
- [ ] Check response has existing machine info

Expected results:
```json
{
  "machineId": "trademind-63eea370",
  "websocketUrl": "wss://trademind-63eea370.fly.dev",
  "status": "running",
  "message": "Machine already active"
}
```

Test criteria:
- [ ] No UPDATE or INSERT performed
- [ ] Returns existing machine info
- [ ] No new events logged

**Checkpoint:** Idempotent behavior verified

##### Task 3.5: Test Stopping State Rejection (10 min)
Test scenario: User tries to provision while machine is stopping

Setup:
```sql
UPDATE cloud_machines
SET status = 'stopping'
WHERE user_id = '63eea370-27a1-4099-866a-e3ed340b278d';
```

Actions:
- [ ] Call provision-machine endpoint
- [ ] Verify 409 Conflict response
- [ ] Check error message is helpful

Expected results:
```json
{
  "error": "Machine is currently stopping",
  "message": "Please wait for the machine to fully stop before restarting.",
  "machineId": "trademind-63eea370",
  "status": "stopping"
}
```

HTTP status: 409

Test criteria:
- [ ] Returns 409 Conflict
- [ ] No database changes
- [ ] Clear error message
- [ ] Includes machine status

**Checkpoint:** Edge case handled correctly

##### Task 3.6: Test Concurrent Provision Attempts (20 min)
Test scenario: User double-clicks provision button

Setup:
```sql
DELETE FROM cloud_machines WHERE user_id = '63eea370-27a1-4099-866a-e3ed340b278d';
```

Actions:
- [ ] Make two simultaneous API calls to provision-machine
- [ ] Verify only one machine record created
- [ ] Check both requests succeed (one INSERT, one finds existing)

Test method:
```bash
# Terminal 1
curl -X POST https://jtpqkbybuxbcvqeffmtf.supabase.co/functions/v1/provision-machine \
  -H "Authorization: Bearer SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId":"63eea370-27a1-4099-866a-e3ed340b278d","region":"sin"}' &

# Terminal 2 (run immediately)
curl -X POST https://jtpqkbybuxbcvqeffmtf.supabase.co/functions/v1/provision-machine \
  -H "Authorization: Bearer SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId":"63eea370-27a1-4099-866a-e3ed340b278d","region":"sin"}' &
```

Test criteria:
- [ ] Both requests return 200 OK
- [ ] Only one machine record in database
- [ ] UNIQUE constraint prevents duplicates
- [ ] One request did INSERT, other found existing

**Checkpoint:** Race conditions handled by database constraints

##### Task 3.7: End-to-End Flow Test (10 min)
Test scenario: Complete lifecycle from error to success

Actions:
1. [ ] Start with machine in error state
2. [ ] Call provision-machine (should reuse)
3. [ ] Verify machine transitions to starting/running
4. [ ] Call stop-machine
5. [ ] Verify machine transitions to stopped
6. [ ] Call provision-machine again (should reuse)
7. [ ] Verify successful restart

Database checks after each step:
```sql
SELECT status, error_message, error_count FROM cloud_machines
WHERE user_id = '63eea370-27a1-4099-866a-e3ed340b278d';
```

Test criteria:
- [ ] Full lifecycle works end-to-end
- [ ] Single machine record throughout
- [ ] State transitions are correct
- [ ] No orphaned records

**Phase 3 Complete When:**
- All test scenarios pass
- No duplicate key violations
- State transitions work correctly
- Edge cases handled gracefully
- Cloud events logged properly

---

#### Phase 4: Cleanup & Documentation (30 minutes)
**Objective:** Clean up test data and finalize

##### Task 4.1: Remove Test Data (10 min)
Actions:
- [ ] Delete test machine records
- [ ] Remove test cloud_events
- [ ] Verify production data unaffected

Cleanup script:
```sql
-- Delete test data (only if needed)
DELETE FROM cloud_events
WHERE user_id = '63eea370-27a1-4099-866a-e3ed340b278d'
  AND event_type = 'machine_retry';

-- Keep the actual user's machine record if they're a real user
-- Only delete if this was a test account
-- DELETE FROM cloud_machines WHERE user_id = 'test-user-id';
```

Test criteria:
- [ ] Test data removed
- [ ] Production data intact
- [ ] No orphaned records

**Checkpoint:** Database clean

##### Task 4.2: Update Issue Documentation (10 min)
Files to update:
- `issues/2025-10-02-fix-cloud-machine-reuse.md`

Actions:
- [ ] Mark all success criteria as complete
- [ ] Update status to "implemented"
- [ ] Document any deviations from plan
- [ ] Add deployment notes

Test criteria:
- [ ] All checkboxes marked
- [ ] Final status updated
- [ ] Notes added for future reference

##### Task 4.3: Deploy to Production (10 min)
Actions:
- [ ] Verify migration already applied
- [ ] Deploy Edge Function update
- [ ] Monitor logs for errors
- [ ] Test with real user (if available)

Deployment commands:
```bash
# Deploy Edge Function
supabase functions deploy provision-machine

# Verify deployment
supabase functions list

# Check logs
supabase functions logs provision-machine
```

Test criteria:
- [ ] Edge Function deployed successfully
- [ ] No errors in logs
- [ ] Real user can provision
- [ ] No regressions in existing functionality

**Phase 4 Complete When:**
- Test data cleaned up
- Documentation updated
- Deployed to production
- Monitoring shows no errors

---

### Testing Strategy

#### Commands to Run After Each Task
```bash
# Type check
cd supabase/functions/provision-machine
deno check index.ts

# Deploy to Supabase
supabase functions deploy provision-machine

# View logs
supabase functions logs provision-machine --limit 50
```

#### Manual Testing Checklist
- [ ] First-time provision creates new machine
- [ ] Retry after error reuses machine
- [ ] Retry after stopped reuses machine
- [ ] Active machine returns existing info
- [ ] Stopping machine rejects with 409
- [ ] Concurrent provisions don't create duplicates
- [ ] Error count increments correctly
- [ ] Retry events logged to cloud_events
- [ ] Timestamps updated properly
- [ ] No console errors

### Rollback Plan

If critical issues arise:

**Step 1: Revert Edge Function**
```bash
# Get previous deployment ID
supabase functions list --show-versions provision-machine

# Revert to previous version
supabase functions deploy provision-machine --version <previous-version>
```

**Step 2: Database Rollback (if needed)**
```sql
-- Drop new function
DROP FUNCTION IF EXISTS increment_machine_error_count(UUID);

-- Revert event type constraint
ALTER TABLE cloud_events DROP CONSTRAINT IF EXISTS cloud_events_event_type_check;
ALTER TABLE cloud_events ADD CONSTRAINT cloud_events_event_type_check
  CHECK (event_type IN (
    'machine_provisioned', 'machine_started', 'machine_stopped',
    'machine_scaled', 'machine_error',
    'config_synced', 'trader_added', 'trader_removed', 'trader_updated',
    'signal_created', 'analysis_completed',
    'websocket_connected', 'websocket_disconnected', 'health_check_failed'
  ));
```

**Step 3: Document Issues**
- [ ] Note what failed in issue comments
- [ ] Tag PM for review
- [ ] Plan corrective action

### Success Metrics

Implementation is complete when:
- [ ] Migration applied to production (Phase 1)
- [ ] Edge Function refactored and deployed (Phase 2)
- [ ] All test scenarios pass (Phase 3)
- [ ] Documentation updated (Phase 4)
- [ ] No duplicate key constraint violations
- [ ] Users can retry after errors
- [ ] Exactly one machine record per user maintained
- [ ] Audit trail preserved in cloud_events
- [ ] No regressions in existing functionality

### Risk Tracking

| Phase | Risk | Mitigation | Status |
|-------|------|------------|--------|
| 1 | Migration breaks existing events | Test function before deploying | ⏳ |
| 2 | Breaking change in API response | Add wasReused as optional field | ⏳ |
| 2 | Logic errors in state transitions | Comprehensive testing in Phase 3 | ⏳ |
| 3 | Concurrent requests cause issues | UNIQUE constraints handle this | ⏳ |
| 4 | Production deployment failures | Have rollback plan ready | ⏳ |

### Time Estimates
- Phase 1 (Migration): 30 minutes
- Phase 2 (Refactor): 2 hours
- Phase 3 (Testing): 1.5 hours
- Phase 4 (Cleanup): 30 minutes
- **Total: 4.5 hours**

### Open Questions for PM

1. **Retry Limit:** Should we enforce a maximum retry count (e.g., error_count > 5 blocks retry)?
   - Current plan: No limit, allow unlimited retries
   - Alternative: Add check in provision logic to reject if error_count > threshold
   - **PM Decision:** ?

2. **Region Changes:** Should users be able to change region when retrying?
   - Current plan: Allow region change on retry
   - Alternative: Enforce same region for machine lifetime
   - **PM Decision:** ?

3. **Error Archival:** Is logging to cloud_events sufficient for error history?
   - Current plan: Archive to events, clear from machine record
   - Alternative: Keep error_history JSON array in machine record
   - **PM Decision:** Current approach is sufficient ✓

### Next Actions

1. ✅ Complete prerequisites (install Supabase CLI, link project)
2. ✅ Create feature branch: `fix/cloud-machine-reuse`
3. Start Phase 1: Create and deploy migration
4. Continue with Phase 2: Refactor Edge Function
5. Test thoroughly in Phase 3
6. Deploy in Phase 4

---
*[End of plan. Next: /implement issues/2025-10-02-fix-cloud-machine-reuse.md]*
