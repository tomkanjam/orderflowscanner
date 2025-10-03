-- Check if user profile exists
SELECT * FROM user_profiles WHERE id = '63eea370-27a1-4099-866a-e3ed340b278d';

-- If it doesn't exist, create it
INSERT INTO user_profiles (id, subscription_tier)
VALUES ('63eea370-27a1-4099-866a-e3ed340b278d', 'elite')
ON CONFLICT (id) DO UPDATE
SET subscription_tier = 'elite';

-- Verify it was created
SELECT 
  id,
  subscription_tier,
  created_at
FROM user_profiles 
WHERE id = '63eea370-27a1-4099-866a-e3ed340b278d';
