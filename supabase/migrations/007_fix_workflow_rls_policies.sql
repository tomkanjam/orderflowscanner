-- Fix missing RLS policies for workflow_schedules table
-- This migration fixes the 403 Forbidden errors when creating workflow schedules

-- First drop existing policies if any (in case of partial application)
DROP POLICY IF EXISTS "Users can view own workflow schedules" ON workflow_schedules;
DROP POLICY IF EXISTS "Users can create own workflow schedules" ON workflow_schedules;
DROP POLICY IF EXISTS "Users can update own workflow schedules" ON workflow_schedules;
DROP POLICY IF EXISTS "Users can delete own workflow schedules" ON workflow_schedules;

-- Create proper RLS policies
-- Users can view their own workflow schedules
CREATE POLICY "Users can view own workflow schedules" ON workflow_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM traders t 
      WHERE t.id = workflow_schedules.trader_id 
      AND t.user_id = auth.uid()
    )
  );

-- Users can create workflow schedules for their own traders
CREATE POLICY "Users can create own workflow schedules" ON workflow_schedules
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM traders t 
      WHERE t.id = workflow_schedules.trader_id 
      AND t.user_id = auth.uid()
    )
  );

-- Users can update their own workflow schedules
CREATE POLICY "Users can update own workflow schedules" ON workflow_schedules
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM traders t 
      WHERE t.id = workflow_schedules.trader_id 
      AND t.user_id = auth.uid()
    )
  );

-- Users can delete their own workflow schedules
CREATE POLICY "Users can delete own workflow schedules" ON workflow_schedules
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM traders t 
      WHERE t.id = workflow_schedules.trader_id 
      AND t.user_id = auth.uid()
    )
  );

-- Note: The following tables will be created in a future migration and will need their RLS policies:
-- - monitoring_decisions
-- - position_management_decisions  
-- - workflow_execution_logs