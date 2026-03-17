ALTER TABLE user_telegram_settings ADD COLUMN IF NOT EXISTS notify_implied_increase BOOLEAN DEFAULT true;
