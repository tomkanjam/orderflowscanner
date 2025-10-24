-- Update your tier to elite
UPDATE user_profiles
SET tier = 'elite'
WHERE id = '63eea370-27a1-4099-866a-e3ed340b278d';

-- Verify the change
SELECT id, email, tier, is_admin
FROM user_profiles
WHERE id = '63eea370-27a1-4099-866a-e3ed340b278d';
