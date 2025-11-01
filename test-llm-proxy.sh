#!/bin/bash

ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0cHFrYnlidXhiY3ZxZWZmbXRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA1MzQ3NjIsImV4cCI6MjA2NjExMDc2Mn0.mqPuNP6kHN-qz_15TPteqDDJiG_S_rp233VR_xHSe8M"

echo "Testing generate-filter-code operation..."
curl -s -X POST https://jtpqkbybuxbcvqeffmtf.supabase.co/functions/v1/llm-proxy \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"operation":"generate-filter-code","params":{"conditions":["RSI below 30"],"klineInterval":"15m"}}' | jq '.'
