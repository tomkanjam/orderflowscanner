-- Add language field to traders table to support Go and JavaScript execution

ALTER TABLE traders
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'javascript' CHECK (language IN ('javascript', 'go'));

-- Create index for faster filtering by language
CREATE INDEX IF NOT EXISTS idx_traders_language ON traders(language);

-- Comment
COMMENT ON COLUMN traders.language IS 'Programming language of the filter code: javascript (legacy) or go (new)';

-- Update existing traders to explicitly mark as javascript
UPDATE traders
SET language = 'javascript'
WHERE language IS NULL;
