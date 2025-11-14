-- Migration: Create user_fly_apps tables for dedicated Fly app provisioning
-- Description: Track Fly apps provisioned for Pro/Elite users with health monitoring and event logging

-- =====================================================
-- Table: user_fly_apps
-- =====================================================
CREATE TABLE user_fly_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fly_app_name TEXT NOT NULL UNIQUE, -- e.g., vyx-user-abc12345
  fly_org_slug TEXT NOT NULL, -- Fly organization
  status TEXT NOT NULL CHECK (status IN ('provisioning', 'active', 'error', 'deprovisioning', 'deleted')),
  region TEXT NOT NULL, -- e.g., 'sjc', 'iad', 'sin'

  -- Deployment info
  docker_image TEXT NOT NULL, -- registry.fly.io/vyx-app:deployment-XXX
  deployed_at TIMESTAMPTZ,

  -- Health monitoring
  last_health_check TIMESTAMPTZ,
  health_status TEXT CHECK (health_status IN ('healthy', 'unhealthy', 'unknown')),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Cost tracking
  monthly_cost_estimate_usd DECIMAL(10,2),
  cpu_count INTEGER NOT NULL DEFAULT 2,
  memory_mb INTEGER NOT NULL DEFAULT 512,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT one_app_per_user UNIQUE(user_id)
);

-- Indexes
CREATE INDEX idx_user_fly_apps_user_id ON user_fly_apps(user_id);
CREATE INDEX idx_user_fly_apps_status ON user_fly_apps(status);
CREATE INDEX idx_user_fly_apps_fly_app_name ON user_fly_apps(fly_app_name);

-- RLS Policies
ALTER TABLE user_fly_apps ENABLE ROW LEVEL SECURITY;

-- Users can view their own app
CREATE POLICY "Users can view own fly app"
  ON user_fly_apps FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can view all apps
CREATE POLICY "Admins can view all fly apps"
  ON user_fly_apps FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Only service role can insert/update/delete
CREATE POLICY "Service role can manage fly apps"
  ON user_fly_apps FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- Table: user_fly_app_events
-- =====================================================
CREATE TABLE user_fly_app_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fly_app_id UUID NOT NULL REFERENCES user_fly_apps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'provision_requested', 'provision_started', 'provision_completed', 'provision_failed',
    'health_check_passed', 'health_check_failed',
    'deprovision_requested', 'deprovision_started', 'deprovision_completed', 'deprovision_failed',
    'error_occurred', 'recovery_attempted'
  )),
  status TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  error_details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_user_fly_app_events_fly_app_id ON user_fly_app_events(fly_app_id);
CREATE INDEX idx_user_fly_app_events_user_id ON user_fly_app_events(user_id);
CREATE INDEX idx_user_fly_app_events_created_at ON user_fly_app_events(created_at DESC);

-- RLS
ALTER TABLE user_fly_app_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own app events"
  ON user_fly_app_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all app events"
  ON user_fly_app_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "Service role can insert events"
  ON user_fly_app_events FOR INSERT
  TO service_role
  WITH CHECK (true);

-- =====================================================
-- Trigger Function: Auto-provision/deprovision on tier changes
-- =====================================================
CREATE OR REPLACE FUNCTION handle_user_tier_change()
RETURNS TRIGGER AS $$
DECLARE
  requires_fly_app BOOLEAN;
  had_fly_app BOOLEAN;
BEGIN
  -- Determine if new tier requires Fly app (pro or elite)
  requires_fly_app := NEW.tier IN ('pro', 'elite');

  -- Determine if old tier had Fly app
  had_fly_app := OLD.tier IN ('pro', 'elite');

  -- Upgraded to Pro/Elite - provision Fly app
  IF requires_fly_app AND NOT had_fly_app THEN
    PERFORM net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/provision-user-fly-app',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'user_id', NEW.user_id::text,
        'tier', NEW.tier
      )
    );
  END IF;

  -- Downgraded from Pro/Elite to Free - deprovision Fly app
  IF had_fly_app AND NOT requires_fly_app THEN
    PERFORM net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/deprovision-user-fly-app',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'user_id', NEW.user_id::text,
        'reason', 'tier_downgrade'
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS on_user_tier_change ON user_subscriptions;
CREATE TRIGGER on_user_tier_change
  AFTER UPDATE OF tier ON user_subscriptions
  FOR EACH ROW
  WHEN (OLD.tier IS DISTINCT FROM NEW.tier)
  EXECUTE FUNCTION handle_user_tier_change();

-- =====================================================
-- Helper Functions
-- =====================================================

-- Get user's Fly app status
CREATE OR REPLACE FUNCTION get_user_fly_app_status(p_user_id UUID)
RETURNS TABLE (
  app_name TEXT,
  status TEXT,
  health TEXT,
  last_check TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    fly_app_name,
    user_fly_apps.status,
    health_status,
    last_health_check
  FROM user_fly_apps
  WHERE user_id = p_user_id
    AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_fly_app_status(UUID) TO authenticated;
