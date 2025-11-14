-- Migration: Create view for user_fly_apps with user profiles
-- Description: Join user_fly_apps with user_profiles through auth.users to enable PostgREST queries

-- Create the view
CREATE VIEW user_fly_apps_with_profiles AS
SELECT
  ufa.id,
  ufa.user_id,
  ufa.fly_app_name,
  ufa.fly_org_slug,
  ufa.status,
  ufa.region,
  ufa.docker_image,
  ufa.deployed_at,
  ufa.last_health_check,
  ufa.health_status,
  ufa.error_message,
  ufa.retry_count,
  ufa.monthly_cost_estimate_usd,
  ufa.cpu_count,
  ufa.memory_mb,
  ufa.created_at,
  ufa.updated_at,
  ufa.deleted_at,
  up.email,
  up.display_name
FROM user_fly_apps ufa
JOIN user_profiles up ON ufa.user_id = up.id
WHERE ufa.deleted_at IS NULL;

-- Enable RLS on the view
ALTER VIEW user_fly_apps_with_profiles SET (security_invoker = true);

-- Grant access to authenticated users (RLS policies from underlying tables will apply)
GRANT SELECT ON user_fly_apps_with_profiles TO authenticated;
GRANT SELECT ON user_fly_apps_with_profiles TO service_role;
