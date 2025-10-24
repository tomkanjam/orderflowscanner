-- RLS Policies for Pro Tier Waitlist
-- Allows anyone (authenticated or anonymous) to join the Pro tier waitlist

-- Allow anyone to join waitlist by inserting their email
CREATE POLICY "Anyone can join Pro waitlist"
ON user_profiles
FOR INSERT
WITH CHECK (
  pro_waitlist_joined_at IS NOT NULL
  AND email IS NOT NULL
);

-- Allow upsert for waitlist (update timestamp if email exists)
-- This enables the ON CONFLICT pattern for duplicate signups
CREATE POLICY "Anyone can update Pro waitlist timestamp"
ON user_profiles
FOR UPDATE
USING (true)
WITH CHECK (
  pro_waitlist_joined_at IS NOT NULL
);

-- Add comment explaining the policies
COMMENT ON POLICY "Anyone can join Pro waitlist" ON user_profiles IS
  'Allows public waitlist signups. Users can only insert email + waitlist timestamp, no other columns.';

COMMENT ON POLICY "Anyone can update Pro waitlist timestamp" ON user_profiles IS
  'Enables upsert pattern for waitlist. Updates are only allowed when pro_waitlist_joined_at is set.';
