-- Migration: Rename machine_id to fly_app_id for clarity
--
-- Context: Column was named machine_id from old cloud_machines architecture.
-- Now it references user_fly_apps.id (dedicated Fly apps per user).
-- Renaming for production clarity.

-- Step 1: Rename the column
ALTER TABLE signals
RENAME COLUMN machine_id TO fly_app_id;

-- Step 2: Update the comment
COMMENT ON COLUMN signals.fly_app_id IS 'Reference to user_fly_apps.id for user-dedicated Fly app. NULL for shared backend signals.';

-- Step 3: Rename the index
DROP INDEX IF EXISTS idx_signals_machine_id;
CREATE INDEX IF NOT EXISTS idx_signals_fly_app_id ON signals(fly_app_id);

-- Note: Foreign key constraint name stays the same (signals_machine_id_fkey)
-- PostgreSQL doesn't require renaming FK constraints when column is renamed
