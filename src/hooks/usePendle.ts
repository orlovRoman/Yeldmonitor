import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { callRateXApi, type RateXMarket } from '@/hooks/useRateX';
import type { PendlePool, PendleRateHistory, PendleAlert, PoolWithLatestRate } from '@/types/pendle';

export function usePendlePools() {
  return useQuery({
    queryKey: ['pendle-pools'],
    queryFn: async (): Promise<PoolWithLatestRate[]> => {
      // Fetch Supabase pools (Pendle/Spectra/Exponent) and RateX API in parallel
      const [supabaseResult, ratexResult] = await Promise.allSettled([
        supabase
          .from('pendle_pools')
          .select('*')
          .order('updated_at', { ascending: false }),
        callRateXApi<RateXMarket[]>('querySymbol')
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
        if (m.is_delete === '1') return false;
        if (!m.due_date) return true;
        return new Date(m.due_date) > now;
      }).map(m => {
        const poolId = `ratex-${m.id}`;
        return {
          id: poolId,
          chain_id: 502, // RateX (Solana)
          market_address: `ratex-${m.symbol}`,
          name: `[RateX] ${m.symbol_name}`,
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
            liquidity: 0, // Not available directly in list
            volume_24h: 0,
            recorded_at: new Date().toISOString(),
          }
        } as PoolWithLatestRate;
      });

      // Combine all pools
      return [...supabasePoolsWithRates, ...activeRatexPools];
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

      if (ratexResult.status === 'fulfilled' && Array.isArray(ratexResult.value)) {
        // Filter valid RateX markets just like in the pools hook
        const now = new Date();
        const activeRatex = ratexResult.value.filter(m => {
          if (m.is_delete === '1') return false;
          if (!m.due_date) return true;
          return new Date(m.due_date) > now;
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
