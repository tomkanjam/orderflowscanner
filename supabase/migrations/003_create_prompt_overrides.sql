-- Create prompt_overrides table for storing custom prompt versions
CREATE TABLE IF NOT EXISTS prompt_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for efficient querying
CREATE INDEX idx_prompt_overrides_prompt_id ON prompt_overrides(prompt_id);
CREATE INDEX idx_prompt_overrides_active ON prompt_overrides(prompt_id, is_active) WHERE is_active = true;
CREATE INDEX idx_prompt_overrides_created_at ON prompt_overrides(created_at DESC);

-- Add RLS policies
ALTER TABLE prompt_overrides ENABLE ROW LEVEL SECURITY;

-- Policy to allow authenticated users to read all prompts
CREATE POLICY "Allow authenticated users to read prompt overrides"
  ON prompt_overrides
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy to allow only specific admin user to insert/update
CREATE POLICY "Allow admin to manage prompt overrides"
  ON prompt_overrides
  FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'email' = 'tom@tomk.ca')
  WITH CHECK (auth.jwt() ->> 'email' = 'tom@tomk.ca');

-- Add comment
COMMENT ON TABLE prompt_overrides IS 'Stores custom versions of AI prompts for the crypto screener application';