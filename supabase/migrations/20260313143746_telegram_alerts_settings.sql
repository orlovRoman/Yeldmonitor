-- Table for storing user Telegram settings and link codes
CREATE TABLE IF NOT EXISTS public.user_telegram_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID, -- Optional, if we want to link to an auth.users later
  telegram_chat_id BIGINT,
  telegram_username TEXT,
  connection_code TEXT UNIQUE,
  implied_apy_threshold_percent NUMERIC DEFAULT 1.0,
  underlying_apy_threshold_percent NUMERIC DEFAULT 1.0,
  platforms JSONB DEFAULT '["Pendle", "Spectra", "Exponent", "RateX"]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by code or chat_id
CREATE INDEX IF NOT EXISTS idx_user_tg_settings_code ON public.user_telegram_settings(connection_code);
CREATE INDEX IF NOT EXISTS idx_user_tg_settings_chat_id ON public.user_telegram_settings(telegram_chat_id);

-- Apply RLS
ALTER TABLE public.user_telegram_settings ENABLE ROW LEVEL SECURITY;

-- Allow public read/write (since there is no strict auth currently, users manage by random codes)
CREATE POLICY "Allow public insert to user_telegram_settings" ON public.user_telegram_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read of user_telegram_settings" ON public.user_telegram_settings FOR SELECT USING (true);
CREATE POLICY "Allow public update of user_telegram_settings" ON public.user_telegram_settings FOR UPDATE USING (true);
CREATE POLICY "Allow public delete of user_telegram_settings" ON public.user_telegram_settings FOR DELETE USING (true);

-- Update timestamp trigger
CREATE TRIGGER update_user_telegram_settings_updated_at
  BEFORE UPDATE ON public.user_telegram_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
