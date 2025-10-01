-- Set your account to Elite tier to access cloud execution features
-- Run this in Supabase SQL Editor

-- Step 1: Find your account
SELECT
  id,
  email,
  subscription_tier as current_tier,
  created_at
FROM profiles
ORDER BY created_at DESC
LIMIT 10;

-- Step 2: Update to Elite (replace YOUR_USER_ID with the id from Step 1)
UPDATE profiles
SET subscription_tier = 'elite'
WHERE id = 'YOUR_USER_ID';

-- Step 3: Verify the change
SELECT
  id,
  email,
  subscription_tier as new_tier
FROM profiles
WHERE subscription_tier = 'elite';
