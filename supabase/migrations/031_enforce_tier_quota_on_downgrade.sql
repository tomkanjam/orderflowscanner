-- ============================================================================
-- Enforce Tier Quota on Subscription Downgrade
-- ============================================================================
-- Purpose: Auto-disable excess traders when users downgrade subscription tiers
-- Related Issue: 20251030-122001-000-free-tier-custom-trader-bypass.md
-- ============================================================================

-- Drop existing function to recreate with enhanced logic
DROP FUNCTION IF EXISTS initialize_resource_usage_for_user() CASCADE;

-- Enhanced function to handle quota enforcement on tier changes
CREATE OR REPLACE FUNCTION initialize_resource_usage_for_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_traders_limit INTEGER;
  current_enabled_count INTEGER;
  traders_to_disable INTEGER;
  disabled_trader_ids UUID[];
  disabled_trader_names TEXT[];
BEGIN
  -- Determine max traders based on tier
  max_traders_limit := CASE NEW.tier
    WHEN 'free' THEN 0
    WHEN 'pro' THEN 10
    WHEN 'elite' THEN 1000 -- Effectively unlimited
    ELSE 0
  END;

  -- Count currently enabled custom traders (not built-in)
  SELECT COUNT(*) INTO current_enabled_count
  FROM traders
  WHERE user_id = NEW.user_id
    AND enabled = true
    AND ownership_type = 'user'
    AND is_built_in = false;

  -- If current enabled count exceeds new quota, auto-disable excess traders
  IF current_enabled_count > max_traders_limit THEN
    traders_to_disable := current_enabled_count - max_traders_limit;

    RAISE NOTICE 'User % downgraded to tier %. Disabling % excess traders (quota: %, current: %)',
      NEW.user_id, NEW.tier, traders_to_disable, max_traders_limit, current_enabled_count;

    -- Disable oldest traders first and collect their info for notification
    WITH disabled AS (
      UPDATE traders
      SET enabled = false,
          updated_at = NOW()
      WHERE id IN (
        SELECT id FROM traders
        WHERE user_id = NEW.user_id
          AND enabled = true
          AND ownership_type = 'user'
          AND is_built_in = false
        ORDER BY created_at ASC  -- Disable oldest first
        LIMIT traders_to_disable
      )
      RETURNING id, name
    )
    SELECT array_agg(id), array_agg(name)
    INTO disabled_trader_ids, disabled_trader_names
    FROM disabled;

    -- Create notification for user about disabled traders
    INSERT INTO notification_queue (user_id, type, channel, status, payload, created_at)
    VALUES (
      NEW.user_id,
      'position_alert', -- Using existing type, could add 'subscription_downgrade' later
      'in_app',
      'pending',
      jsonb_build_object(
        'title', 'Traders Disabled Due to Subscription Change',
        'message', format('You downgraded to %s tier. %s custom trader(s) have been disabled. Upgrade to re-enable them.',
                         UPPER(NEW.tier), traders_to_disable),
        'disabled_count', traders_to_disable,
        'disabled_trader_names', disabled_trader_names,
        'new_tier', NEW.tier,
        'new_max_traders', max_traders_limit,
        'previous_enabled_count', current_enabled_count
      ),
      NOW()
    );

    RAISE NOTICE 'Disabled traders: %', disabled_trader_names;
  END IF;

  -- Create or update resource usage record for current billing period
  INSERT INTO trader_resource_usage (
    user_id,
    max_traders,
    tier,
    period_start,
    period_end,
    created_at,
    updated_at
  ) VALUES (
    NEW.user_id,
    max_traders_limit,
    NEW.tier,
    DATE_TRUNC('month', NOW()),
    DATE_TRUNC('month', NOW() + INTERVAL '1 month'),
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, period_start) DO UPDATE
  SET max_traders = max_traders_limit,
      tier = NEW.tier,
      updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger (it was dropped with CASCADE above)
DROP TRIGGER IF EXISTS on_subscription_change ON user_subscriptions;

CREATE TRIGGER on_subscription_change
AFTER INSERT OR UPDATE OF tier ON user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION initialize_resource_usage_for_user();

-- Also handle subscription status changes (expired, cancelled)
-- When subscription becomes inactive, disable all custom traders
CREATE OR REPLACE FUNCTION handle_subscription_status_change()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  disabled_count INTEGER;
BEGIN
  -- If subscription becomes inactive (cancelled or past_due), disable all custom traders
  IF (NEW.status IN ('cancelled', 'past_due') AND OLD.status = 'active') THEN

    -- Disable all custom traders
    WITH disabled AS (
      UPDATE traders
      SET enabled = false,
          updated_at = NOW()
      WHERE user_id = NEW.user_id
        AND enabled = true
        AND ownership_type = 'user'
        AND is_built_in = false
      RETURNING id
    )
    SELECT COUNT(*) INTO disabled_count FROM disabled;

    IF disabled_count > 0 THEN
      RAISE NOTICE 'User % subscription status changed to %. Disabled % custom traders',
        NEW.user_id, NEW.status, disabled_count;

      -- Notify user
      INSERT INTO notification_queue (user_id, type, channel, status, payload, created_at)
      VALUES (
        NEW.user_id,
        'position_alert',
        'in_app',
        'pending',
        jsonb_build_object(
          'title', 'Subscription Inactive - Traders Disabled',
          'message', format('Your subscription is %s. All custom traders have been disabled. Please update your payment method to continue.', NEW.status),
          'disabled_count', disabled_count,
          'subscription_status', NEW.status
        ),
        NOW()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for status changes
DROP TRIGGER IF EXISTS on_subscription_status_change ON user_subscriptions;

CREATE TRIGGER on_subscription_status_change
AFTER UPDATE OF status ON user_subscriptions
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION handle_subscription_status_change();

-- ============================================================================
-- Verification Query
-- ============================================================================
-- Use this to verify the migration worked:
/*
-- Check that triggers exist
SELECT tgname, tgrelid::regclass, tgfoid::regproc
FROM pg_trigger
WHERE tgname IN ('on_subscription_change', 'on_subscription_status_change');

-- Test the logic (as admin):
-- 1. Create test user with Pro tier and 5 enabled traders
-- 2. UPDATE user_subscriptions SET tier = 'free' WHERE user_id = '<test_user_id>';
-- 3. Verify all 5 traders are now disabled
-- 4. Check notification_queue for the notification
*/

-- ============================================================================
-- Migration Complete
-- ============================================================================
