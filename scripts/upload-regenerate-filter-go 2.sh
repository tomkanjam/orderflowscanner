#!/bin/bash

# Upload regenerate-filter-go prompt to Braintrust
# This script uploads the Go filter generation prompt to Braintrust

set -e

# Configuration
PROJECT_ID="5df22744-d29c-4b01-b18b-e3eccf2ddbba"
PROMPT_FILE="backend/go-screener/prompts/regenerate-filter-go.md"

# Check if API key is in Supabase secrets
echo "📋 Fetching BRAINTRUST_API_KEY from Supabase secrets..."
API_KEY=$(supabase secrets list | grep BRAINTRUST_API_KEY | awk '{print $NF}')

if [ -z "$API_KEY" ]; then
    echo "❌ Could not fetch BRAINTRUST_API_KEY from Supabase secrets"
    echo "Please set it manually: export BRAINTRUST_API_KEY=your_key"
    exit 1
fi

echo "✅ API key fetched"

# Read prompt content
if [ ! -f "$PROMPT_FILE" ]; then
    echo "❌ Prompt file not found: $PROMPT_FILE"
    exit 1
fi

PROMPT_CONTENT=$(cat "$PROMPT_FILE")
echo "✅ Loaded prompt content ($(echo -n "$PROMPT_CONTENT" | wc -c) characters)"

# Escape the prompt content for JSON
ESCAPED_CONTENT=$(echo "$PROMPT_CONTENT" | jq -Rs .)

# Create JSON payload
PAYLOAD=$(cat <<EOF
{
  "project_id": "$PROJECT_ID",
  "name": "Regenerate Filter Code (Go)",
  "slug": "regenerate-filter-go",
  "description": "Generates Go filter code for cryptocurrency trading signals",
  "prompt_data": {
    "prompt": {
      "type": "completion",
      "content": $ESCAPED_CONTENT
    },
    "options": {
      "model": "anthropic/claude-haiku-4.5",
      "params": {
        "temperature": 0.4,
        "max_tokens": 4000
      }
    }
  }
}
EOF
)

# Upload to Braintrust
echo "📤 Uploading to Braintrust..."
RESPONSE=$(curl -s -X PUT \
  "https://api.braintrust.dev/v1/prompt" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

# Check response
if echo "$RESPONSE" | jq -e '.id' > /dev/null 2>&1; then
    PROMPT_ID=$(echo "$RESPONSE" | jq -r '.id')
    echo "✅ Successfully uploaded prompt!"
    echo "   Prompt ID: $PROMPT_ID"
    echo "   Slug: regenerate-filter-go"
    echo ""
    echo "📋 Next steps:"
    echo "1. Visit https://www.braintrust.dev/ to verify the prompt"
    echo "2. Test trader generation in the UI"
else
    echo "❌ Upload failed!"
    echo "Response: $RESPONSE"
    exit 1
fi
