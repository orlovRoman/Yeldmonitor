import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { callRateXApi, type RateXMarket } from '@/hooks/useRateX';
import type { PendlePool, PendleRateHistory, PendleAlert, PoolWithLatestRate } from '@/types/pendle';

export function usePendlePools() {
  return useQuery({
    queryKey: ['pendle-pools'],
    queryFn: async (): Promise<PoolWithLatestRate[]> => {
      // Fetch Supabase pools (Pendle/Spectra/Exponent) and RateX API in parallel
      const [supabaseResult, ratexResult, ratexStatsResult] = await Promise.allSettled([
        supabase
          .from('pendle_pools')
          .select('*')
          .order('updated_at', { ascending: false }),
        callRateXApi<RateXMarket[]>('querySymbol'),
        callRateXApi<any[]>('querySolanaTermRewardRate')
      ]);

      // Process Supabase pools
      let pools: any[] = [];
      if (supabaseResult.status === 'fulfilled' && supabaseResult.value.data) {
        pools = supabaseResult.value.data;
      } else if (supabaseResult.status === 'rejected') {
        console.error('Supabase fetch error:', supabaseResult.reason);
      }

      // Process RateX pools
      let ratexMarkets: RateXMarket[] = [];
      if (ratexResult.status === 'fulfilled') {
        const data = ratexResult.value;
        if (Array.isArray(data)) {
          ratexMarkets = data;
        }
      } else {
        console.error('RateX fetch error:', ratexResult.reason);
      }

      // Process RateX Stats (TVL/Liquidity)
      let ratexStats: any[] = [];
      if (ratexStatsResult.status === 'fulfilled') {
        ratexStats = Array.isArray(ratexStatsResult.value) ? ratexStatsResult.value : [];
      } else {
        console.error('RateX stats fetch error:', ratexStatsResult.reason);
      }

      // Filter active Supabase pools
      const now = new Date();
      const activeSupabasePools = pools.filter(pool => {
        if (!pool.expiry) return true;
        return new Date(pool.expiry) > now;
      });

      // Get latest rates for Supabase pools
      const supabasePoolsWithRates = await Promise.all(
        activeSupabasePools.map(async (pool) => {
          const { data: rates } = await supabase
            .from('pendle_rates_history')
            .select('*')
            .eq('pool_id', pool.id)
            .order('recorded_at', { ascending: false })
            .limit(1)
            .single();

          return {
            ...pool,
            latest_rate: rates || undefined,
          } as PoolWithLatestRate;
        })
      );

      // Map RateX markets to PoolWithLatestRate format
      const activeRatexPools = ratexMarkets.filter(m => {
        const isDeleted = m.is_delete === '1' || (m as any).is_delete === 1;
        if (isDeleted) return false;

        if (m.due_date_l) {
          return Number(m.due_date_l) > now.getTime();
        }

        if (!m.due_date) return true;
        try {
          const dateStr = m.due_date.replace(' 24:00:00', ' 23:59:59');
          const marketDate = new Date(dateStr);
          return isNaN(marketDate.getTime()) || marketDate > now;
        } catch (e) {
          return true;
        }
      }).map(m => {
        const poolId = `ratex-${m.id || m.symbol}`;

        // Find TVL for this symbol from stats
        // API returns multiple entries (1D, 7D, 30D), we pick the one with TVL
        const stats = ratexStats.filter(s => s.symbol === m.symbol);
        const tvlStat = stats.find(s => s.tvl && parseFloat(s.tvl) > 0) || stats[0];
        const liquidity = tvlStat ? parseFloat(tvlStat.tvl) || 0 : 0;

        return {
          id: poolId,
          chain_id: 502, // RateX (Solana)
          market_address: `ratex-${m.symbol}`,
          name: `[RateX] ${m.symbol_name || m.symbol}`,
          underlying_asset: m.symbol_level1_category || m.symbol_name,
          expiry: m.due_date,
          pt_address: m.pt_mint,
          yt_address: null,
          sy_address: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          latest_rate: {
            id: `rate-ratex-${m.id}`,
            pool_id: poolId,
            implied_apy: m.initial_upper_yield_range,
            underlying_apy: m.initial_lower_yield_range,
            liquidity: liquidity,
            volume_24h: 0,
            recorded_at: new Date().toISOString(),
          }
        } as PoolWithLatestRate;
      });

      // Combine all pools
      console.log(`[Debug] Combining pools: Supabase=${supabasePoolsWithRates.length}, RateX=${activeRatexPools.length}`);

      const finalPools = [...supabasePoolsWithRates, ...activeRatexPools];
      console.log(`[Debug] Final combined pools count: ${finalPools.length}`);
      return finalPools;
    },
    refetchInterval: 60000, // Refetch every minute
  });
}

export function usePoolRateHistory(poolId: string | null) {
  return useQuery({
    queryKey: ['pool-rate-history', poolId],
    queryFn: async (): Promise<PendleRateHistory[]> => {
      if (!poolId) return [];

      const { data, error } = await supabase
        .from('pendle_rates_history')
        .select('*')
        .eq('pool_id', poolId)
        .order('recorded_at', { ascending: true })
        .limit(100);

      if (error) throw error;
      return (data || []) as PendleRateHistory[];
    },
    enabled: !!poolId,
  });
}

export function usePendleAlerts() {
  return useQuery({
    queryKey: ['pendle-alerts'],
    queryFn: async (): Promise<PendleAlert[]> => {
      const { data, error } = await supabase
        .from('pendle_alerts')
        .select(`
          *,
          pendle_pools (*)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      return (data || []) as PendleAlert[];
    },
    refetchInterval: 30000,
  });
}

export function useFetchMarkets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('fetch-pendle-markets');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendle-pools'] });
      queryClient.invalidateQueries({ queryKey: ['pendle-alerts'] });
    },
  });
}

export function useFetchSpectraMarkets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('fetch-spectra-markets');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendle-pools'] });
    },
  });
}

export function useFetchExponentMarkets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('fetch-exponent-markets');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendle-pools'] });
    },
  });
}

export function useAnalyzeAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertId: string) => {
      const { data, error } = await supabase.functions.invoke('analyze-alert', {
        body: { alertId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendle-alerts'] });
    },
  });
}

export function useDismissAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertId: string) => {
      const { data, error } = await supabase.functions.invoke('dismiss-alert', {
        body: { alertId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendle-alerts'] });
    },
  });
}

export function useStats() {
  return useQuery({
    queryKey: ['pendle-stats'],
    queryFn: async () => {
      const [poolResult, alertResult, networksResult, ratexResult] = await Promise.allSettled([
        supabase.from('pendle_pools').select('*', { count: 'exact', head: true }),
        supabase.from('pendle_alerts').select('*', { count: 'exact', head: true }).eq('status', 'new'),
        supabase.from('pendle_pools').select('chain_id'),
        callRateXApi<RateXMarket[]>('querySymbol')
      ]);

      let poolCount = 0;
      let alertCount = 0;
      let networks: number[] = [];
      let ratexCount = 0;

      if (poolResult.status === 'fulfilled' && poolResult.value.count !== null) {
        poolCount = poolResult.value.count;
      }

      if (alertResult.status === 'fulfilled' && alertResult.value.count !== null) {
        alertCount = alertResult.value.count;
      }

      if (networksResult.status === 'fulfilled' && networksResult.value.data) {
        networks = networksResult.value.data.map(p => p.chain_id);
      }

      if (ratexResult.status === 'fulfilled' && ratexResult.value) {
        // Filter valid RateX markets just like in the pools hook
        const now = new Date();
        const ratexMarkets = ratexResult.value as any[];
        const activeRatex = ratexMarkets.filter(m => {
          const isDeleted = m.is_delete === '1' || m.is_delete === 1;
          if (isDeleted) return false;
          if (!m.due_date) return true;
          try {
            return new Date(m.due_date) > now;
          } catch (e) {
            return true;
          }
        });
        ratexCount = activeRatex.length;
      }

      // Count unique networks
      const uniqueNetworks = new Set(networks);
      if (ratexCount > 0) {
        uniqueNetworks.add(502); // Add RateX chain ID (Solana)
      }

      return {
        totalPools: poolCount + ratexCount,
        newAlerts: alertCount,
        networkCount: uniqueNetworks.size,
      };
    },
    refetchInterval: 60000,
  });
}

// Note: useNewPools was removed - now using usePendlePools for all pools display
