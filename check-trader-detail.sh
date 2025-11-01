#!/bin/bash

ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0cHFrYnlidXhiY3ZxZWZmbXRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA1MzQ3NjIsImV4cCI6MjA2NjExMDc2Mn0.mqPuNP6kHN-qz_15TPteqDDJiG_S_rp233VR_xHSe8M"

echo "=== Stoch RSI Trader Details ==="
curl -s "https://jtpqkbybuxbcvqeffmtf.supabase.co/rest/v1/traders?id=eq.53460502-f27f-482f-8ddf-e5888fe30c4d&select=*" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" | jq '.[0]'
