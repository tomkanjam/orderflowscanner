# Fix Metadata Stream Parsing in generateTraderMetadata

**Type:** bug
**Initiative:** none
**Created:** 2025-11-06 00:00:00

## Context
The `generateTraderMetadata` function in `geminiService.ts` is receiving the complete SSE stream including the final `complete` event with all metadata, but fails to extract it. The logs show:
- Stream receives `event: complete` with full metadata in `data` field
- Parser processes the event but never assigns `finalMetadata`
- Function throws "No metadata received from stream" error

## Linked Items
- Part of: End-to-end trader workflow implementation

## Progress
Fixed and committed.

## Spec
The issue was in `geminiService.ts:228`. The `currentEvent` variable was declared inside the `while (true)` loop that processes chunks, causing it to reset to `''` for each new chunk. When an SSE event like `event: complete` arrived in one chunk and its corresponding `data: {...}` line arrived in the next chunk, the `currentEvent` would be empty when parsing the data line, so the condition `currentEvent === 'complete'` would fail.

Fix: Move `currentEvent` declaration outside the loop (line 210) so it persists across chunks.

## Completion
**Closed:** 2025-11-06 00:00:00
**Outcome:** Success
**Commits:** 5ade148
