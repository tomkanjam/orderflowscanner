-- Check Elite status for tom@tomk.ca
SELECT
  id,
  email,
  subscription_tier,
  created_at,
  updated_at
FROM profiles
WHERE email = 'tom@tomk.ca';

-- Also check auth.users
SELECT
  id,
  email,
  created_at
FROM auth.users
WHERE email = 'tom@tomk.ca';
