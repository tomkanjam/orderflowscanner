-- Seed all prompts including the fixed generate-trader-metadata prompt
-- This ensures all prompts are available in the database

-- Clear existing prompts to avoid conflicts (optional, remove if you want to preserve existing data)
-- TRUNCATE TABLE prompts CASCADE;

-- Insert all prompts

-- The prompts need to be inserted from the seedPrompts.ts file
-- Due to the complexity of the prompt content, please run the seedPrompts.ts script
-- or manually copy the prompts from apps/app/src/scripts/seedPrompts.ts

-- To run the seed script:
-- cd apps/app
-- npx tsx src/scripts/seedPrompts.ts

-- Note: You may need to temporarily disable RLS or use admin credentials
