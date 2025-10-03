-- Check the schema of user_profiles table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_profiles'
ORDER BY ordinal_position;

-- Check current user profile
SELECT * FROM user_profiles WHERE id = '63eea370-27a1-4099-866a-e3ed340b278d';

-- Check all profiles to understand the structure
SELECT * FROM user_profiles LIMIT 5;
