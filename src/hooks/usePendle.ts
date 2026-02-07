import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PendlePool, PendleRateHistory, PendleAlert, PoolWithLatestRate } from '@/types/pendle';

export function usePendlePools() {
  return useQuery({
    queryKey: ['pendle-pools'],
    queryFn: async (): Promise<PoolWithLatestRate[]> => {
      const { data: pools, error } = await supabase
        .from('pendle_pools')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // Filter out expired pools on the frontend as well
      const now = new Date();
      const activePools = (pools || []).filter(pool => {
        if (!pool.expiry) return true;
        return new Date(pool.expiry) > now;
      });

      // Get latest rates for each pool
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
        .limit(50);

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
      queryClient.invalidateQueries({ queryKey: ['new-pools'] });
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
      const [{ count: poolCount }, { count: alertCount }, { data: pools }] = await Promise.all([
        supabase.from('pendle_pools').select('*', { count: 'exact', head: true }),
        supabase.from('pendle_alerts').select('*', { count: 'exact', head: true }).eq('status', 'new'),
        supabase.from('pendle_pools').select('chain_id'),
      ]);

      // Count unique networks
      const uniqueNetworks = new Set((pools || []).map(p => p.chain_id));

      return {
        totalPools: poolCount || 0,
        newAlerts: alertCount || 0,
        networkCount: uniqueNetworks.size,
      };
    },
    refetchInterval: 60000,
  });
}

// Hook to fetch new pools (added in the last 24 hours OR recently updated with new rates)
export function useNewPools() {
  return useQuery({
    queryKey: ['new-pools'],
    queryFn: async () => {
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);

      // Get pools created in last 24h OR updated in last 24h (which includes new markets)
      const { data: pools, error } = await supabase
        .from('pendle_pools')
        .select('*')
        .or(`created_at.gte.${oneDayAgo.toISOString()},updated_at.gte.${oneDayAgo.toISOString()}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get latest rates for liquidity and filter to only pools with recent first rate record
      const poolsWithRates = await Promise.all(
        (pools || []).map(async (pool) => {
          const { data: rates } = await supabase
            .from('pendle_rates_history')
            .select('liquidity, recorded_at')
            .eq('pool_id', pool.id)
            .order('recorded_at', { ascending: true })
            .limit(1)
            .single();

          // Check if this pool's first rate record is within last 24 hours (new market)
          const isNewMarket = rates?.recorded_at && 
            new Date(rates.recorded_at) > oneDayAgo;

          // Include if created in last 24h OR is a new market (first rate in last 24h)
          const isNew = new Date(pool.created_at) > oneDayAgo || isNewMarket;

          return {
            ...pool,
            liquidity: rates?.liquidity || null,
            isNew,
          };
        })
      );

      // Filter to only truly new pools/markets
      return poolsWithRates.filter(p => p.isNew);
    },
    refetchInterval: 60000,
  });
}
