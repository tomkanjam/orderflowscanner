-- Migration: Fix handle_user_tier_change to use Vault instead of config parameters
-- Description: Retrieve Supabase URL and service role key from Vault instead of current_setting()

CREATE OR REPLACE FUNCTION handle_user_tier_change()
RETURNS TRIGGER AS $$
DECLARE
  requires_fly_app BOOLEAN;
  had_fly_app BOOLEAN;
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Determine if new tier requires Fly app (pro or elite)
  requires_fly_app := NEW.tier IN ('pro', 'elite');

  -- Determine if old tier had Fly app
  had_fly_app := OLD.tier IN ('pro', 'elite');

  -- Retrieve secrets from Vault
  SELECT decrypted_secret INTO supabase_url
  FROM vault.decrypted_secrets
  WHERE name = 'project_url';

  SELECT decrypted_secret INTO service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key';

  -- Upgraded to Pro/Elite - provision Fly app
  IF requires_fly_app AND NOT had_fly_app THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/provision-user-fly-app',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || service_role_key,
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
      url := supabase_url || '/functions/v1/deprovision-user-fly-app',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || service_role_key,
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
