-- Create waitlist table
CREATE TABLE IF NOT EXISTS public.waitlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  signed_up_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  referral_source VARCHAR(100),
  utm_campaign VARCHAR(100),
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  ip_address INET,
  user_agent TEXT,
  converted BOOLEAN DEFAULT FALSE,
  converted_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON public.waitlist(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_signed_up_at ON public.waitlist(signed_up_at DESC);

-- Enable Row Level Security
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Allow anonymous users to insert into waitlist
CREATE POLICY "Enable insert for anonymous users" ON public.waitlist
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow authenticated users to view waitlist (for admin)
CREATE POLICY "Enable read access for authenticated users" ON public.waitlist
  FOR SELECT
  TO authenticated
  USING (true);

-- Add comment for documentation
COMMENT ON TABLE public.waitlist IS 'Stores email addresses for the product waitlist';
COMMENT ON COLUMN public.waitlist.email IS 'Email address of the person joining the waitlist';
COMMENT ON COLUMN public.waitlist.signed_up_at IS 'Timestamp when the user signed up';
COMMENT ON COLUMN public.waitlist.referral_source IS 'Where the user came from (e.g., twitter, blog)';
COMMENT ON COLUMN public.waitlist.utm_campaign IS 'UTM campaign parameter';
COMMENT ON COLUMN public.waitlist.utm_source IS 'UTM source parameter';
COMMENT ON COLUMN public.waitlist.utm_medium IS 'UTM medium parameter';
COMMENT ON COLUMN public.waitlist.converted IS 'Whether the waitlist user converted to a paying customer';
COMMENT ON COLUMN public.waitlist.converted_at IS 'Timestamp when the user converted';