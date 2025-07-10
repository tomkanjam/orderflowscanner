-- Create prompts table for storing base prompt templates
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('screener', 'analysis', 'trader')),
  description TEXT NOT NULL,
  system_instruction TEXT NOT NULL,
  user_prompt_template TEXT,
  parameters TEXT[] DEFAULT '{}',
  placeholders JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create prompt versions table for tracking changes
CREATE TABLE IF NOT EXISTS prompt_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  system_instruction TEXT NOT NULL,
  user_prompt_template TEXT,
  version INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT false,
  change_notes TEXT,
  UNIQUE(prompt_id, version)
);

-- Create indexes for performance
CREATE INDEX idx_prompts_category ON prompts(category);
CREATE INDEX idx_prompts_active ON prompts(is_active);
CREATE INDEX idx_prompt_versions_prompt_id ON prompt_versions(prompt_id);
CREATE INDEX idx_prompt_versions_active ON prompt_versions(prompt_id, is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;

-- Policies for prompts table
CREATE POLICY "Allow all users to read prompts"
  ON prompts
  FOR SELECT
  USING (true);

CREATE POLICY "Allow admin to manage prompts"
  ON prompts
  FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'email' = 'tom@tomk.ca')
  WITH CHECK (auth.jwt() ->> 'email' = 'tom@tomk.ca');

-- Policies for prompt_versions table
CREATE POLICY "Allow all users to read prompt versions"
  ON prompt_versions
  FOR SELECT
  USING (true);

CREATE POLICY "Allow admin to manage prompt versions"
  ON prompt_versions
  FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'email' = 'tom@tomk.ca')
  WITH CHECK (auth.jwt() ->> 'email' = 'tom@tomk.ca');

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamps
CREATE TRIGGER update_prompts_updated_at BEFORE UPDATE ON prompts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE prompts IS 'Stores AI prompt templates for the crypto screener application';
COMMENT ON TABLE prompt_versions IS 'Tracks version history of prompt changes';