-- Check and Set Elite Tier for Testing Cloud Execution
-- Run this in Supabase SQL Editor

-- First, check your current tier
SELECT
  id,
  email,
  subscription_tier,
  is_admin,
  created_at
FROM profiles
ORDER BY created_at DESC
LIMIT 5;

-- If your tier is not 'elite', uncomment and run this:
-- UPDATE profiles
-- SET subscription_tier = 'elite'
-- WHERE email = 'your@email.com';  -- ← Replace with your email

-- Verify the change
-- SELECT id, email, subscription_tier FROM profiles WHERE email = 'your@email.com';
