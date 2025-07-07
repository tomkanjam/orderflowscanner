-- Create user profiles table with subscription info
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  tier TEXT CHECK (tier IN ('free', 'pro', 'elite')) DEFAULT 'free',
  status TEXT CHECK (status IN ('active', 'cancelled', 'past_due')) DEFAULT 'active',
  custom_signals_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  favorite_signals UUID[] DEFAULT '{}',
  notification_enabled BOOLEAN DEFAULT false,
  notification_channels TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add subscription fields to traders table
ALTER TABLE traders 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS ownership_type TEXT CHECK (ownership_type IN ('system', 'user')) DEFAULT 'user',
ADD COLUMN IF NOT EXISTS access_tier TEXT CHECK (access_tier IN ('anonymous', 'free', 'pro', 'elite')) DEFAULT 'elite',
ADD COLUMN IF NOT EXISTS is_built_in BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Create notification queue table
CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  trader_id UUID REFERENCES traders(id) ON DELETE CASCADE,
  signal_id UUID REFERENCES signals(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('signal_triggered', 'analysis_complete', 'trade_executed', 'position_alert')),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'push', 'in_app')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  payload JSONB,
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_traders_user_id ON traders(user_id);
CREATE INDEX idx_traders_ownership_type ON traders(ownership_type);
CREATE INDEX idx_traders_access_tier ON traders(access_tier);
CREATE INDEX idx_traders_is_built_in ON traders(is_built_in);
CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_tier ON user_subscriptions(tier);
CREATE INDEX idx_notification_queue_user_id ON notification_queue(user_id);
CREATE INDEX idx_notification_queue_status ON notification_queue(status);

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
CREATE POLICY "Users can view their own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id OR is_admin = true);

CREATE POLICY "Users can update their own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can manage all profiles" ON user_profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- RLS Policies for user_subscriptions
CREATE POLICY "Users can view their own subscription" ON user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Only system can manage subscriptions" ON user_subscriptions
  FOR ALL USING (false); -- Will use service role key for subscription management

-- RLS Policies for user_preferences
CREATE POLICY "Users can manage their own preferences" ON user_preferences
  FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for traders (update existing)
DROP POLICY IF EXISTS "Users can view their own traders" ON traders;
DROP POLICY IF EXISTS "Users can create traders" ON traders;
DROP POLICY IF EXISTS "Users can update their own traders" ON traders;
DROP POLICY IF EXISTS "Users can delete their own traders" ON traders;

-- New trader policies with tier support
CREATE POLICY "View traders based on tier" ON traders
  FOR SELECT USING (
    -- Anonymous users can only see anonymous tier signals
    (auth.uid() IS NULL AND access_tier = 'anonymous' AND is_built_in = true)
    OR
    -- Authenticated users can see signals based on their tier
    (auth.uid() IS NOT NULL AND (
      -- Users can always see their own signals
      user_id = auth.uid()
      OR
      -- Built-in signals based on user's tier
      (is_built_in = true AND (
        access_tier = 'anonymous'
        OR (access_tier = 'free' AND EXISTS (
          SELECT 1 FROM user_subscriptions 
          WHERE user_id = auth.uid() AND tier IN ('free', 'pro', 'elite') AND status = 'active'
        ))
        OR (access_tier = 'pro' AND EXISTS (
          SELECT 1 FROM user_subscriptions 
          WHERE user_id = auth.uid() AND tier IN ('pro', 'elite') AND status = 'active'
        ))
        OR (access_tier = 'elite' AND EXISTS (
          SELECT 1 FROM user_subscriptions 
          WHERE user_id = auth.uid() AND tier = 'elite' AND status = 'active'
        ))
      ))
    ))
  );

CREATE POLICY "Users can create traders based on tier" ON traders
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (
      -- Admins can create any trader
      EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE id = auth.uid() AND is_admin = true
      )
      OR
      -- Pro users can create up to 10 traders
      (EXISTS (
        SELECT 1 FROM user_subscriptions 
        WHERE user_id = auth.uid() 
        AND tier = 'pro' 
        AND status = 'active'
        AND custom_signals_count < 10
      ))
      OR
      -- Elite users can create unlimited
      EXISTS (
        SELECT 1 FROM user_subscriptions 
        WHERE user_id = auth.uid() 
        AND tier = 'elite' 
        AND status = 'active'
      )
    )
  );

CREATE POLICY "Users can update their own traders" ON traders
  FOR UPDATE USING (
    auth.uid() = user_id
    OR
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "Users can delete their own traders" ON traders
  FOR DELETE USING (
    auth.uid() = user_id
    OR
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- RLS Policies for notification_queue
CREATE POLICY "Users can view their own notifications" ON notification_queue
  FOR SELECT USING (auth.uid() = user_id);

-- Functions
CREATE OR REPLACE FUNCTION update_custom_signals_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE user_subscriptions 
    SET custom_signals_count = custom_signals_count + 1
    WHERE user_id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE user_subscriptions 
    SET custom_signals_count = custom_signals_count - 1
    WHERE user_id = OLD.user_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update custom signals count
CREATE TRIGGER update_user_custom_signals_count
AFTER INSERT OR DELETE ON traders
FOR EACH ROW
WHEN (NEW.ownership_type = 'user' OR OLD.ownership_type = 'user')
EXECUTE FUNCTION update_custom_signals_count();

-- Triggers for updated_at
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_subscriptions_updated_at BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to initialize user profile and subscription on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create user profile
  INSERT INTO user_profiles (id, email)
  VALUES (NEW.id, NEW.email);
  
  -- Create default subscription
  INSERT INTO user_subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'active');
  
  -- Create default preferences
  INSERT INTO user_preferences (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION handle_new_user();