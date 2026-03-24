-- Add notification interval and last_notified_at columns to user_telegram_settings
ALTER TABLE public.user_telegram_settings
  ADD COLUMN IF NOT EXISTS notification_interval_minutes INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;

-- Add a check to enforce minimum interval of 10 minutes
ALTER TABLE public.user_telegram_settings
  ADD CONSTRAINT notification_interval_min CHECK (notification_interval_minutes >= 10);

COMMENT ON COLUMN public.user_telegram_settings.notification_interval_minutes IS 'Interval in minutes between periodic Telegram notifications. Minimum: 10 min. Common values: 10, 60, 190, 360.';
COMMENT ON COLUMN public.user_telegram_settings.last_notified_at IS 'Timestamp of the last periodic notification sent to this user.';
