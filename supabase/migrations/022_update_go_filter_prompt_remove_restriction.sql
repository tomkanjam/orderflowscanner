-- Update the Go filter generation prompt to remove the "only use helpers" restriction
-- and clarify that full customization is available

-- Note: This prompt is stored in the database and loaded from the markdown file during server startup
-- The canonical source is: backend/go-screener/prompts/regenerate-filter-go.md
-- This migration serves as documentation that the prompt was updated on this date

-- Manual update required: Run `pnpm upload-prompts` to sync the updated prompt to the database
-- Or update the system_instruction field directly in the prompts table

UPDATE prompts
SET
  description = 'Converts human-readable conditions into Go filter code for backend execution. Supports full customization with raw kline data and math operations.',
  updated_at = NOW()
WHERE id = 'regenerate-filter-go';

-- Add comment documenting the key changes
COMMENT ON TABLE prompts IS 'LLM prompts for various AI operations. Filter prompts now support full Go code customization beyond pre-defined helpers.';
