-- Add Pro tier waitlist tracking to user_profiles
-- This allows users to express interest in the Pro tier before it launches

ALTER TABLE user_profiles
ADD COLUMN pro_waitlist_joined_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for querying waitlist users
CREATE INDEX idx_user_profiles_pro_waitlist ON user_profiles(pro_waitlist_joined_at)
WHERE pro_waitlist_joined_at IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN user_profiles.pro_waitlist_joined_at IS 'Timestamp when user joined the Pro tier waitlist. NULL if not on waitlist.';
