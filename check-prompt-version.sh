#!/bin/bash

ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0cHFrYnlidXhiY3ZxZWZmbXRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA1MzQ3NjIsImV4cCI6MjA2NjExMDc2Mn0.mqPuNP6kHN-qz_15TPteqDDJiG_S_rp233VR_xHSe8M"

echo "=== Checking which prompt version is being used ==="
echo ""

echo "1. Check Braintrust prompt version:"
curl -s -H "Authorization: Bearer sk-OS6ksPJXNJJOaXBwPHmd0H3JfkYoucoCCTzKn6a69LsNmG3v" \
  "https://api.braintrust.dev/v1/prompt?project_id=5df22744-d29c-4b01-b18b-e3eccf2ddbba&slug=regenerate-filter-go" | \
  jq '{
    name: .objects[0].name,
    slug: .objects[0].slug,
    version: .objects[0]._xact_id,
    updated: .objects[0].created,
    first_50_chars: (.objects[0].prompt_data.prompt.content | .[0:100])
  }'

echo ""
echo "2. Search for 'unlimited' or 'conveniences' in prompt:"
curl -s -H "Authorization: Bearer sk-OS6ksPJXNJJOaXBwPHmd0H3JfkYoucoCCTzKn6a69LsNmG3v" \
  "https://api.braintrust.dev/v1/prompt?project_id=5df22744-d29c-4b01-b18b-e3eccf2ddbba&slug=regenerate-filter-go" | \
  jq -r '.objects[0].prompt_data.prompt.content' | grep -i "unlimited\|conveniences" | head -3

echo ""
echo "3. Check for 'Helper Functions Not Yet Available' section:"
curl -s -H "Authorization: Bearer sk-OS6ksPJXNJJOaXBwPHmd0H3JfkYoucoCCTzKn6a69LsNmG3v" \
  "https://api.braintrust.dev/v1/prompt?project_id=5df22744-d29c-4b01-b18b-e3eccf2ddbba&slug=regenerate-filter-go" | \
  jq -r '.objects[0].prompt_data.prompt.content' | grep -A 2 "Not Yet Available"

echo ""
echo "4. Test filter generation with debug:"
curl -s -X POST https://jtpqkbybuxbcvqeffmtf.supabase.co/functions/v1/llm-proxy \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"operation":"generate-filter-code","params":{"conditions":["Stochastic RSI K line below 40"],"klineInterval":"15m"}}' | \
  jq '{
    success,
    error,
    filter_snippet: (.data.filterCode | .[0:200]),
    tokens: .usage.total_tokens
  }'
