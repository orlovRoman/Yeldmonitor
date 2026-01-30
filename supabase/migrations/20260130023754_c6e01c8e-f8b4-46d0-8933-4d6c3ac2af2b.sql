-- Fix PUBLIC_DATA_EXPOSURE: Restrict UPDATE and INSERT on all tables to service role only
-- Service role bypasses RLS, so USING (false) blocks anon/authenticated users but allows edge functions

-- pendle_alerts: Block public INSERT and UPDATE
DROP POLICY IF EXISTS "Allow service role insert for alerts" ON public.pendle_alerts;
DROP POLICY IF EXISTS "Allow service role update for alerts" ON public.pendle_alerts;

CREATE POLICY "Service role only inserts alerts" 
ON public.pendle_alerts 
FOR INSERT 
WITH CHECK (false);

CREATE POLICY "Service role only updates alerts" 
ON public.pendle_alerts 
FOR UPDATE 
USING (false);

-- pendle_pools: Block public INSERT and UPDATE
DROP POLICY IF EXISTS "Allow service role insert for pools" ON public.pendle_pools;
DROP POLICY IF EXISTS "Allow service role update for pools" ON public.pendle_pools;

CREATE POLICY "Service role only inserts pools" 
ON public.pendle_pools 
FOR INSERT 
WITH CHECK (false);

CREATE POLICY "Service role only updates pools" 
ON public.pendle_pools 
FOR UPDATE 
USING (false);

-- pendle_rates_history: Block public INSERT
DROP POLICY IF EXISTS "Allow service role insert for rates" ON public.pendle_rates_history;

CREATE POLICY "Service role only inserts rates" 
ON public.pendle_rates_history 
FOR INSERT 
WITH CHECK (false);