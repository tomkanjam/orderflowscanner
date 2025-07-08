-- Add RLS policies for admin user management

-- Allow admins to view all profiles
CREATE POLICY "Admins can view all profiles" ON user_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Allow admins to update all profiles
CREATE POLICY "Admins can update all profiles" ON user_profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Allow admins to view all subscriptions
CREATE POLICY "Admins can view all subscriptions" ON user_subscriptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Allow admins to update all subscriptions
CREATE POLICY "Admins can update all subscriptions" ON user_subscriptions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Create a view that combines user data for easier querying
CREATE OR REPLACE VIEW user_management_view AS
SELECT 
  p.id,
  p.email,
  p.display_name,
  p.is_admin,
  p.created_at as profile_created_at,
  s.tier,
  s.status as subscription_status,
  s.custom_signals_count,
  s.started_at as subscription_started_at,
  s.expires_at as subscription_expires_at
FROM user_profiles p
LEFT JOIN user_subscriptions s ON p.id = s.user_id;

-- Grant access to the view
GRANT SELECT ON user_management_view TO authenticated;