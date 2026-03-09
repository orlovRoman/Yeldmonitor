import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PendlePool, PendleRateHistory, PendleAlert, PoolWithLatestRate } from '@/types/pendle';

export function usePendlePools() {
  return useQuery({
    queryKey: ['pendle-pools'],
    queryFn: async (): Promise<PoolWithLatestRate[]> => {
      // Fetch all pools from Supabase (Pendle, Spectra, Exponent, RateX)
      const { data: pools, error } = await supabase
        .from('pendle_pools')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Supabase fetch error:', error);
        return [];
      }

      // Filter active pools (not expired)
      const now = new Date();
      const activePools = (pools || []).filter(pool => {
        if (!pool.expiry) return true;
        return new Date(pool.expiry) > now;
      });

      // Get latest rates for all pools
      const poolsWithRates = await Promise.all(
        activePools.map(async (pool) => {
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

      console.log(`[Debug] Total active pools: ${poolsWithRates.length}`);
      return poolsWithRates;
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

export function useFetchRateXMarkets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('fetch-ratex-markets');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendle-pools'] });
      queryClient.invalidateQueries({ queryKey: ['pendle-alerts'] });
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
      const [poolResult, alertResult, networksResult] = await Promise.allSettled([
        supabase.from('pendle_pools').select('*', { count: 'exact', head: true }),
        supabase.from('pendle_alerts').select('*', { count: 'exact', head: true }).eq('status', 'new'),
        supabase.from('pendle_pools').select('chain_id'),
      ]);

      let poolCount = 0;
      let alertCount = 0;
      let networks: number[] = [];

      if (poolResult.status === 'fulfilled' && poolResult.value.count !== null) {
        poolCount = poolResult.value.count;
      }

      if (alertResult.status === 'fulfilled' && alertResult.value.count !== null) {
        alertCount = alertResult.value.count;
      }

      if (networksResult.status === 'fulfilled' && networksResult.value.data) {
        networks = networksResult.value.data.map(p => p.chain_id);
      }

      const uniqueNetworks = new Set(networks);

      return {
        totalPools: poolCount,
        newAlerts: alertCount,
        networkCount: uniqueNetworks.size,
      };
    },
    refetchInterval: 60000,
  });
}

// Note: useNewPools was removed - now using usePendlePools for all pools display
