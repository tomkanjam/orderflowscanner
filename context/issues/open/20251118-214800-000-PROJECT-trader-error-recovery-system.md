# Trader Error Recovery System

**Type:** project
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-18 21:48:00

## Context

Currently when trader filter code fails during execution:
- Errors are caught and logged backend/go-screener/internal/trader/executor.go:198-205
- Trader transitions to StateError (state.go:140-150)
- Errors stored in memory only (types.go:72)
- Prometheus metrics track errors (metrics.go:61-67)
- **But users are not notified**
- **And errors are not persisted**
- **And code is not automatically regenerated**

This creates a poor UX where traders silently fail and users have no awareness or recovery path.

## Linked Items

- Part of: End-to-end trader workflow implementation initiative

## Sub-issues

- [ ] `context/issues/open/20251118-214800-001-persist-trader-execution-errors.md` - Persist errors to database
- [ ] `context/issues/open/20251118-214800-002-realtime-trader-error-notifications.md` - Real-time UI + email notifications
- [ ] `context/issues/open/20251118-214800-003-automatic-filter-code-regeneration.md` - Auto-regenerate filter code on errors
- [ ] `context/issues/open/20251118-214800-004-error-recovery-ui-workflow.md` - UI for reviewing regenerated code

## Progress

Not started - awaiting sub-issue creation.

## Spec

### Architecture Overview

```
Filter Execution Error
         ↓
1. Persist to DB (with full stack trace + context)
         ↓
2. Trigger notifications (realtime + email)
         ↓
3. Auto-regenerate filter code (background job)
         ↓
4. Present UI for user review/approval
         ↓
5. Deploy fixed code to Fly machine
```

### Key Components

1. **Error Persistence Layer**
   - Add error columns to traders table
   - Store: error_message, error_type, stack_trace, error_count, last_error_at
   - Create trader_error_history table for audit trail

2. **Notification System**
   - Realtime: Supabase Realtime subscriptions
   - Email: Use existing send-notification-email function
   - In-app: Toast notifications + error badge

3. **Auto-Regeneration Engine**
   - Supabase Edge Function triggered by DB insert
   - Calls Braintrust LLM with error context
   - Uses regenerate-filter-go.md prompt
   - Stores regenerated code as "proposed_fix"

4. **Error Recovery UI**
   - Show error details + proposed fix side-by-side
   - Diff view of changes
   - Test/Preview before accepting
   - One-click deployment

### Technical Considerations

- **Error Classification**: Distinguish compile errors vs runtime errors vs timeout
- **Rate Limiting**: Don't regenerate infinitely on persistent errors
- **Cost Control**: Track LLM calls per user/trader
- **Rollback**: Allow reverting to previous working code
- **Braintrust Integration**: Full tracing of regeneration attempts
