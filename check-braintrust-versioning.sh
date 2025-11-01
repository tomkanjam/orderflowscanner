#!/bin/bash

API_KEY="sk-OS6ksPJXNJJOaXBwPHmd0H3JfkYoucoCCTzKn6a69LsNmG3v"
PROJECT_ID="5df22744-d29c-4b01-b18b-e3eccf2ddbba"

echo "=== Braintrust Prompt Versioning & Tracking ==="
echo ""

echo "1. Get full prompt object with version info:"
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.braintrust.dev/v1/prompt?project_id=$PROJECT_ID&slug=regenerate-filter-go" | \
  jq '.objects[0] | {
    id,
    name,
    slug,
    version: ._xact_id,
    created,
    metadata,
    prompt_data: {
      model: .prompt_data.options.model,
      temperature: .prompt_data.options.params.temperature
    }
  }'

echo ""
echo "2. Check if there are multiple versions (via pagination):"
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.braintrust.dev/v1/prompt?project_id=$PROJECT_ID&slug=regenerate-filter-go&limit=10" | \
  jq '.objects | length'

echo ""
echo "3. List ALL prompts in project to see versioning pattern:"
curl -s -H "Authorization: Bearer $API_KEY" \
  "https://api.braintrust.dev/v1/prompt?project_id=$PROJECT_ID" | \
  jq '.objects[] | {name, slug, version: ._xact_id, created}'

echo ""
echo "4. Check Braintrust logs/traces for this prompt:"
echo "(Note: Traces are typically viewed in UI at https://www.braintrust.dev/app/AI%20Trader/p/logs)"
