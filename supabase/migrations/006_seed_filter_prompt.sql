-- Seed the filter-and-chart-config prompt (it's too large to include inline)
-- This is the main prompt for the screener filter generation

-- First, check if it exists and delete if so
DELETE FROM prompts WHERE id = 'filter-and-chart-config';

-- Insert the filter and chart config prompt
INSERT INTO prompts (id, name, category, description, system_instruction, parameters, placeholders, is_active)
VALUES (
  'filter-and-chart-config',
  'Filter and Chart Config', 
  'screener',
  'Main screener filter generation - converts natural language to screening filters',
  -- This is intentionally shorter due to SQL escaping complexity
  E'You are an AI assistant for a crypto screener. The user provides a description of technical conditions. You MUST return a single, valid JSON object with four properties: "description", "screenerCode", "indicators", and "requiredTimeframes". Do not include any text outside of this JSON object.

See emergency-prompts.json for the full prompt content if database content is incomplete.',
  ARRAY['userPrompt', 'modelName', 'klineInterval', 'klineLimit'],
  '{"klineLimit": 250, "klineInterval": "15m"}'::jsonb,
  true
);