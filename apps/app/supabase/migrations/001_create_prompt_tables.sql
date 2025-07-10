-- Create prompts table
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('screener', 'analysis', 'trader')),
  description TEXT NOT NULL,
  system_instruction TEXT NOT NULL,
  user_prompt_template TEXT,
  parameters JSONB DEFAULT '[]'::jsonb,
  placeholders JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  version INTEGER DEFAULT 1
);

-- Create prompt_versions table for version history
CREATE TABLE IF NOT EXISTS prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  system_instruction TEXT NOT NULL,
  user_prompt_template TEXT,
  version INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT false,
  UNIQUE(prompt_id, version)
);

-- Create indexes
CREATE INDEX idx_prompts_category ON prompts(category);
CREATE INDEX idx_prompts_active ON prompts(is_active);
CREATE INDEX idx_prompt_versions_prompt_id ON prompt_versions(prompt_id);
CREATE INDEX idx_prompt_versions_active ON prompt_versions(prompt_id, is_active);

-- Enable RLS
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;

-- Create policies for prompts (read-only for all, write for admin)
CREATE POLICY "Anyone can read active prompts" ON prompts
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admin can manage prompts" ON prompts
  FOR ALL USING (auth.jwt() ->> 'email' = 'tom@tomk.ca');

-- Create policies for prompt_versions
CREATE POLICY "Anyone can read prompt versions" ON prompt_versions
  FOR SELECT USING (true);

CREATE POLICY "Admin can manage prompt versions" ON prompt_versions
  FOR ALL USING (auth.jwt() ->> 'email' = 'tom@tomk.ca');

-- Insert initial prompts from emergency prompts
INSERT INTO prompts (id, name, category, description, system_instruction, parameters, placeholders)
VALUES 
  ('generate-filter', 'Generate Filter', 'screener', 'Generates screening filters from natural language', 
   'You are an AI assistant that converts natural language trading conditions into executable JavaScript filter functions...', 
   '["helperFunctions", "userPrompt"]'::jsonb, '{}'::jsonb),
  
  ('regenerate-filter', 'Regenerate Filter', 'screener', 'Regenerates filters with improvements based on feedback',
   'You are an AI assistant helping to improve cryptocurrency screening filters...', 
   '["helperFunctions", "currentFilter", "userFeedback"]'::jsonb, '{}'::jsonb),
  
  ('generate-analysis', 'Generate Analysis', 'analysis', 'Generates detailed crypto analysis',
   'You are a cryptocurrency analysis AI assistant...', 
   '["symbol", "data", "userPrompt"]'::jsonb, '{}'::jsonb),
  
  ('trader-strategy', 'Trader Strategy', 'trader', 'Generates trading strategies and signals',
   'You are an AI trading strategy assistant...', 
   '["marketData", "userStrategy"]'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;