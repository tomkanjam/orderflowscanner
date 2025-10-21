# Scripts

## Upload Prompts to Braintrust

### Prerequisites

1. **Get your Braintrust API Key**:
   - Go to https://www.braintrust.dev/app/settings/api-keys
   - Create a new API key
   - Copy it (you'll only see it once!)

2. **Get your Project ID**:
   - Go to your "AI Trader" project in Braintrust
   - Click Settings
   - Copy the Project ID

### Usage

```bash
# Set environment variables
export BRAINTRUST_API_KEY="your_api_key_here"
export BRAINTRUST_PROJECT_ID="your_project_id_here"

# Run the upload script
npx tsx scripts/upload-prompts-to-braintrust.ts
```

### What It Does

1. Loads the prompt content from `docs/BRAINTRUST_PROMPT_SETUP.md`
2. Creates/updates the `generate-filter-code` prompt in Braintrust via REST API
3. Configures it to use Gemini 2.5 Flash model
4. Sets proper JSON response format

### After Upload

1. **Verify**: Visit https://www.braintrust.dev/ and check that the prompt appears
2. **Test**: Use Braintrust playground to test with sample inputs
3. **Deploy**: Mark as production version
4. **Test End-to-End**: Create a trader in the UI and check Fly logs

### Troubleshooting

**"BRAINTRUST_API_KEY environment variable is required"**
- Make sure you've exported the API key as shown above
- Don't include quotes around the value when exporting

**"HTTP 401: Unauthorized"**
- Your API key may be invalid or expired
- Generate a new one from Braintrust settings

**"HTTP 404: Project not found"**
- Check your PROJECT_ID is correct
- Make sure you have access to the project

**"Could not find prompt content markers"**
- The `BRAINTRUST_PROMPT_SETUP.md` file may have been modified
- Check that the prompt content is still between the markers
