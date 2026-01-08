-- Таблица для хранения информации о пулах Pendle
CREATE TABLE public.pendle_pools (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  market_address TEXT NOT NULL,
  name TEXT NOT NULL,
  underlying_asset TEXT,
  pt_address TEXT,
  yt_address TEXT,
  sy_address TEXT,
  expiry TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(chain_id, market_address)
);

-- Таблица для истории ставок (implied и underlying APY)
CREATE TABLE public.pendle_rates_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pool_id UUID NOT NULL REFERENCES public.pendle_pools(id) ON DELETE CASCADE,
  implied_apy DECIMAL(18, 8),
  underlying_apy DECIMAL(18, 8),
  liquidity DECIMAL(24, 8),
  volume_24h DECIMAL(24, 8),
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Таблица для алертов при резких изменениях
CREATE TABLE public.pendle_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pool_id UUID NOT NULL REFERENCES public.pendle_pools(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL, -- 'implied_spike', 'underlying_spike', 'yield_divergence'
  previous_value DECIMAL(18, 8),
  current_value DECIMAL(18, 8),
  change_percent DECIMAL(10, 4),
  ai_analysis TEXT, -- Анализ от Perplexity
  sources JSONB, -- Источники новостей
  status TEXT NOT NULL DEFAULT 'new', -- 'new', 'reviewed', 'dismissed'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Индексы для быстрого поиска
CREATE INDEX idx_rates_history_pool_recorded ON public.pendle_rates_history(pool_id, recorded_at DESC);
CREATE INDEX idx_rates_history_recorded ON public.pendle_rates_history(recorded_at DESC);
CREATE INDEX idx_alerts_status ON public.pendle_alerts(status, created_at DESC);
CREATE INDEX idx_alerts_pool ON public.pendle_alerts(pool_id, created_at DESC);

-- RLS для публичного чтения (данные DeFi публичны)
ALTER TABLE public.pendle_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pendle_rates_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pendle_alerts ENABLE ROW LEVEL SECURITY;

-- Политики для публичного чтения
CREATE POLICY "Allow public read for pools" ON public.pendle_pools FOR SELECT USING (true);
CREATE POLICY "Allow public read for rates" ON public.pendle_rates_history FOR SELECT USING (true);
CREATE POLICY "Allow public read for alerts" ON public.pendle_alerts FOR SELECT USING (true);

-- Политики для вставки через service role (edge functions)
CREATE POLICY "Allow service role insert for pools" ON public.pendle_pools FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service role update for pools" ON public.pendle_pools FOR UPDATE USING (true);
CREATE POLICY "Allow service role insert for rates" ON public.pendle_rates_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service role insert for alerts" ON public.pendle_alerts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service role update for alerts" ON public.pendle_alerts FOR UPDATE USING (true);

-- Триггер для обновления updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_pendle_pools_updated_at
  BEFORE UPDATE ON public.pendle_pools
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();