-- RateX Integration Tables
-- Following the same pattern as Pendle tables

-- Pools table: stores market/symbol info
CREATE TABLE IF NOT EXISTS ratex_pools (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE,
  symbol_name TEXT NOT NULL,
  category_l1 TEXT,            -- e.g. "LRTSSOL", "SONIC", "XSOL"
  category_l2 TEXT,            -- e.g. "lrtsSOL", "sSOL", "xSOL"
  term TEXT,                   -- e.g. "2502", "2506", "2601"
  due_date TIMESTAMPTZ,
  pt_mint TEXT,                -- PT token mint address
  partners TEXT,               -- e.g. "Adrastea Multiplier;Solayer Multiplier;RateX Multiplier"
  partners_icon TEXT,
  partners_reward_boost TEXT,  -- e.g. "2;4;3"
  trade_commission NUMERIC DEFAULT 0,
  initial_lower_yield_range NUMERIC DEFAULT 0,
  initial_upper_yield_range NUMERIC DEFAULT 0,
  earn_w NUMERIC DEFAULT 0,
  ratex_id INTEGER,            -- Original ID from RateX API
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rate history table: stores snapshots of market rates
CREATE TABLE IF NOT EXISTS ratex_rates_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pool_id UUID REFERENCES ratex_pools(id) ON DELETE CASCADE,
  sum_price NUMERIC DEFAULT 0,
  lower_yield NUMERIC DEFAULT 0,
  upper_yield NUMERIC DEFAULT 0,
  earn_w NUMERIC DEFAULT 0,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alerts table: stores price change alerts
CREATE TABLE IF NOT EXISTS ratex_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pool_id UUID REFERENCES ratex_pools(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,      -- 'price_spike'
  previous_value NUMERIC,
  current_value NUMERIC,
  change_percent NUMERIC,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ratex_rates_pool_id ON ratex_rates_history(pool_id);
CREATE INDEX IF NOT EXISTS idx_ratex_rates_recorded_at ON ratex_rates_history(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_ratex_alerts_pool_id ON ratex_alerts(pool_id);
CREATE INDEX IF NOT EXISTS idx_ratex_alerts_created_at ON ratex_alerts(created_at DESC);

-- Enable RLS
ALTER TABLE ratex_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratex_rates_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratex_alerts ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated users
CREATE POLICY "Allow read access to ratex_pools" ON ratex_pools
  FOR SELECT USING (true);

CREATE POLICY "Allow read access to ratex_rates_history" ON ratex_rates_history
  FOR SELECT USING (true);

CREATE POLICY "Allow read access to ratex_alerts" ON ratex_alerts
  FOR SELECT USING (true);

-- Allow service role full access (for edge functions)
CREATE POLICY "Allow service role insert on ratex_pools" ON ratex_pools
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow service role update on ratex_pools" ON ratex_pools
  FOR UPDATE USING (true);

CREATE POLICY "Allow service role insert on ratex_rates_history" ON ratex_rates_history
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow service role insert on ratex_alerts" ON ratex_alerts
  FOR INSERT WITH CHECK (true);
