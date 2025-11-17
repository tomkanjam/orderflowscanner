-- Migration: Update signals.machine_id to reference user_fly_apps instead of cloud_machines
--
-- Context: Migrated from dedicated machines in shared app to dedicated Fly apps per user.
-- The cloud_machines table is part of the old architecture and will be deprecated.
-- The user_fly_apps table is the new source of truth for user-dedicated Fly deployments.

-- Step 1: Drop the old foreign key constraint to cloud_machines
ALTER TABLE signals
DROP CONSTRAINT IF EXISTS signals_machine_id_fkey;

-- Step 2: Update the column comment to reflect the new reference
COMMENT ON COLUMN signals.machine_id IS 'Reference to user_fly_apps.id for user-dedicated Fly app signals. NULL for shared backend signals.';

-- Step 3: Add new foreign key constraint to user_fly_apps
ALTER TABLE signals
ADD CONSTRAINT signals_machine_id_fkey
FOREIGN KEY (machine_id)
REFERENCES user_fly_apps(id)
ON DELETE SET NULL;

-- Step 4: Add index for performance (if not already exists)
CREATE INDEX IF NOT EXISTS idx_signals_machine_id ON signals(machine_id);
