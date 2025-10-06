-- Create signal_analyses table for storing AI-generated trading signal analyses
-- This table stores results from the Edge Function AI analysis pipeline

CREATE TABLE IF NOT EXISTS signal_analyses (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  trader_id UUID NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Analysis results
  decision TEXT NOT NULL CHECK (decision IN ('enter_trade', 'bad_setup', 'wait')),
  confidence DECIMAL(5,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  reasoning TEXT NOT NULL,

  -- Trade execution details (JSONB for flexibility)
  key_levels JSONB NOT NULL,
  trade_plan JSONB NOT NULL,
  technical_indicators JSONB,

  -- Raw AI response (for debugging/retraining)
  raw_ai_response TEXT,

  -- Performance metadata
  analysis_latency_ms INTEGER,
  gemini_tokens_used INTEGER,
  model_name TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for query performance
CREATE INDEX idx_signal_analyses_signal_id ON signal_analyses(signal_id);
CREATE INDEX idx_signal_analyses_user_id ON signal_analyses(user_id);
CREATE INDEX idx_signal_analyses_trader_id ON signal_analyses(trader_id);
CREATE INDEX idx_signal_analyses_created_at ON signal_analyses(created_at DESC);
CREATE INDEX idx_signal_analyses_decision ON signal_analyses(decision);

-- Enable Row Level Security
ALTER TABLE signal_analyses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can read their own analyses
CREATE POLICY "Users can read their own signal analyses"
  ON signal_analyses FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert (Edge Function writes)
CREATE POLICY "Service role can insert signal analyses"
  ON signal_analyses FOR INSERT
  WITH CHECK (true); -- Service role bypasses RLS anyway, but explicit for clarity

-- Service role can update (for corrections/reanalysis)
CREATE POLICY "Service role can update signal analyses"
  ON signal_analyses FOR UPDATE
  USING (true);

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_signal_analyses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_signal_analyses_updated_at_trigger
  BEFORE UPDATE ON signal_analyses
  FOR EACH ROW
  EXECUTE FUNCTION update_signal_analyses_updated_at();

-- Enable Realtime for signal_analyses
ALTER PUBLICATION supabase_realtime ADD TABLE signal_analyses;

-- Add table and column comments for documentation
COMMENT ON TABLE signal_analyses IS 'Stores AI-generated analyses for trading signals from cloud execution';
COMMENT ON COLUMN signal_analyses.decision IS 'AI decision: enter_trade, bad_setup, or wait';
COMMENT ON COLUMN signal_analyses.confidence IS 'AI confidence score 0-100';
COMMENT ON COLUMN signal_analyses.key_levels IS 'Entry, stop loss, take profit levels (JSONB)';
COMMENT ON COLUMN signal_analyses.trade_plan IS 'Structured trade execution plan (JSONB)';
COMMENT ON COLUMN signal_analyses.raw_ai_response IS 'Full Gemini API response for debugging';
