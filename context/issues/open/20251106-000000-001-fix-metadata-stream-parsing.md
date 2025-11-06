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
Starting fix...

## Spec
The issue is in `geminiService.ts:240-265`. When parsing the `complete` event:
1. Line 240 logs the parsed data correctly: `{data: {...}}`
2. But there's no case to handle `event === 'complete'` or extract from `data.data`
3. Need to add handling for the `complete` event to extract metadata from `parsedData.data`

Fix: Add condition to check for `complete` event and assign `parsedData.data` to `finalMetadata`
