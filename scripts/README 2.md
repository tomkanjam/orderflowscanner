# Upload Braintrust Prompts Script

## Purpose

This script uploads the `regenerate-filter-go` prompt to Braintrust programmatically using the Braintrust REST API.

## Prerequisites

1. **Deno** installed on your system
   - Install from: https://deno.land/
   - Check version: `deno --version`

2. **Braintrust API Key**
   - Get it from: https://www.braintrust.dev/ → Organization Settings → API Keys
   - Click "Create API Key" if you don't have one

## Usage

### Option 1: Using Environment Variable (Recommended for CI/CD)

```bash
BRAINTRUST_API_KEY=your_api_key_here \
  deno run --allow-read --allow-net --allow-env scripts/upload-prompt-to-braintrust.ts
```

### Option 2: Interactive Mode (Recommended for local development)

```bash
deno run --allow-read --allow-net --allow-env scripts/upload-prompt-to-braintrust.ts
```

The script will prompt you to enter your API key.

## What the Script Does

1. Reads the full prompt content from `backend/go-screener/prompts/regenerate-filter-go.md`
2. Uploads it to Braintrust project "AI Trader" with:
   - **Slug**: `regenerate-filter-go`
   - **Model**: `google/gemini-2.5-flash`
   - **Temperature**: 0.4
   - **Max Tokens**: 4000
3. Uses HTTP `PUT` method to create or replace the existing prompt

## Expected Output

```
Reading prompt from ./backend/go-screener/prompts/regenerate-filter-go.md...
Loaded 20817 characters from prompt file
Uploading prompt to Braintrust...
✅ Successfully uploaded prompt!
   ID: <prompt-id>
   Slug: regenerate-filter-go
   Model: google/gemini-2.5-flash

You can now test trader creation in the UI.
```

## Troubleshooting

### Error: "Invalid authorization token format"

This likely means your API key is incorrect or expired. Get a fresh API key from Braintrust.

### Error: "Project not found"

Make sure you're using the correct Braintrust organization that contains the "AI Trader" project.

### Error: "File not found"

Run the script from the repository root directory:
```bash
cd /path/to/ai-powered-binance-crypto-screener
deno run --allow-read --allow-net --allow-env scripts/upload-prompt-to-braintrust.ts
```

## Security Notes

- **Never commit API keys to version control**
- The script accepts API keys via environment variable or interactive input
- API keys are not logged or stored by the script
- Use environment variables in CI/CD pipelines

## Related Issues

- #38 - Upload regenerate-filter-go prompt to Braintrust
- #37 - Switch trader/filter creation LLM to Claude Haiku (blocked by #38)
- #41 - Remove Firebase AI code (blocked by #38)
