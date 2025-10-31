# Cascade delete signals when trader is deleted

**Type:** bug
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-10-28 08:28:30

## Context
When a trader is deleted, the associated signals remain in the database and UI. The signals table shows an ID instead of the trader name for these orphaned signals, creating a poor UX and data inconsistency.

Additionally, active traders should not be deletable without first being deactivated. This prevents accidental deletion of traders that are actively monitoring or trading, providing a safety mechanism similar to production trading platforms.

## Linked Items
- Part of: End-to-end trader workflow implementation initiative
- Related: Trader deletion flow, signals table display

## Progress
Issue created - ready for spec phase

## Spec
[To be filled during spec phase - max 100 lines]

## Completion
**Closed:** 2025-10-29 13:44:06
**Outcome:** Abandoned
**Commits:** N/A - No implementation needed at this time
