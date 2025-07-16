-- Revert workflow_schedules table changes from edge function branch
-- This migration ensures the schema matches the main branch requirements

-- First, backup any existing data if needed
DO $$
BEGIN
  -- Check if the schedule column exists
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'workflow_schedules' 
    AND column_name = 'schedule'
  ) THEN
    -- Drop the schedule column
    ALTER TABLE workflow_schedules DROP COLUMN schedule;
  END IF;
  
  -- Check if we need to update workflow_type constraints
  -- First drop the existing constraint
  ALTER TABLE workflow_schedules 
  DROP CONSTRAINT IF EXISTS workflow_schedules_workflow_type_check;
  
  -- Add back the original constraint
  ALTER TABLE workflow_schedules 
  ADD CONSTRAINT workflow_schedules_workflow_type_check 
  CHECK (workflow_type IN ('signal_monitoring', 'position_management'));
  
  -- Update any existing rows with new workflow_type values to use old values
  UPDATE workflow_schedules 
  SET workflow_type = 'signal_monitoring' 
  WHERE workflow_type = 'monitoring';
  
  UPDATE workflow_schedules 
  SET workflow_type = 'position_management' 
  WHERE workflow_type IN ('analysis', 'trading', 'custom');
  
END $$;

-- Ensure all required columns exist with correct types
-- (These should already exist, but this ensures consistency)
ALTER TABLE workflow_schedules 
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN consecutive_errors SET DEFAULT 0,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

-- Ensure all indexes exist
CREATE INDEX IF NOT EXISTS idx_workflow_schedules_active 
  ON workflow_schedules(symbol, interval) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_workflow_schedules_entity 
  ON workflow_schedules(workflow_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_workflow_schedules_trader 
  ON workflow_schedules(trader_id);

-- Ensure trigger exists for updated_at
DROP TRIGGER IF EXISTS update_workflow_schedules_updated_at ON workflow_schedules;
CREATE TRIGGER update_workflow_schedules_updated_at 
  BEFORE UPDATE ON workflow_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Verify final schema
COMMENT ON TABLE workflow_schedules IS 'Stores workflow schedules for signal monitoring and position management';
COMMENT ON COLUMN workflow_schedules.workflow_type IS 'Type of workflow: signal_monitoring or position_management';
COMMENT ON COLUMN workflow_schedules.entity_id IS 'References signal_id for signal_monitoring or position_id for position_management';