import { useState, useEffect } from 'react';
import { TrendingDown, ArrowUpDown, ExternalLink } from 'lucide-react';
import { usePendleAlerts } from '@/hooks/usePendle';
import { CHAIN_NAMES, getPlatformName, getMarketUrl, isSpectraPool, isExponentPool } from '@/types/pendle';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const getDisplayName = (pool: { underlying_asset?: string | null; name?: string } | null | undefined) => {
  if (!pool) return 'Unknown';
  return pool.underlying_asset || pool.name || 'Unknown';
};

type SortBy = 'change' | 'time' | 'apy';

interface UnderlyingApyData {
  [poolId: string]: number | null;
}

export function ImpliedDropsPanel() {
  const { data: alerts, isLoading } = usePendleAlerts();
  const [sortBy, setSortBy] = useState<SortBy>('change');
  const [underlyingApyMap, setUnderlyingApyMap] = useState<UnderlyingApyData>({});

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '—';
    return `${(Number(value) * 100).toFixed(2)}%`;
  };

  const formatChange = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '—';
    const num = Number(value);
    return `${num.toFixed(1)}%`;
  };

  // Filter: only implied_spike with negative change within last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const impliedDrops = (alerts || [])
    .filter((a) => {
      if (a.alert_type !== 'implied_spike') return false;
      if (Number(a.change_percent) >= 0) return false;
      if (new Date(a.created_at) < oneHourAgo) return false;
      return a.status !== 'dismissed';
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'change':
          // Most negative first
          return Number(a.change_percent) - Number(b.change_percent);
        case 'time':
          // Most recent first
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'apy':
          // Lowest current APY first
          return Number(a.current_value) - Number(b.current_value);
        default:
          return 0;
      }
    });

  // Fetch underlying APY for each pool in the drops list
  useEffect(() => {
    const fetchUnderlyingApy = async () => {
      if (impliedDrops.length === 0) return;
      
      const poolIds = [...new Set(impliedDrops.map(a => a.pool_id))];
      const apyMap: UnderlyingApyData = {};
      
      for (const poolId of poolIds) {
        const { data } = await supabase
          .from('pendle_rates_history')
          .select('underlying_apy')
          .eq('pool_id', poolId)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .single();
        
        apyMap[poolId] = data?.underlying_apy ?? null;
      }
      
      setUnderlyingApyMap(apyMap);
    };
    
    fetchUnderlyingApy();
  }, [alerts]);

  if (isLoading) {
    return (
      <div className="rounded-xl bg-card border border-border p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-muted-foreground">Загрузка...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-destructive" />
          <h3 className="font-semibold">Снижение Implied APY (час)</h3>
          {impliedDrops.length > 0 && (
            <Badge variant="destructive" className="text-xs">
              {impliedDrops.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
            <SelectTrigger className="w-[160px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="change">По изменению</SelectItem>
              <SelectItem value="time">По времени</SelectItem>
              <SelectItem value="apy">По APY</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <ScrollArea className="h-[400px]">
        {impliedDrops.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center px-4">
            <TrendingDown className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Нет снижений за последний час</p>
            <p className="text-sm text-muted-foreground mt-1">
              Здесь отображаются пулы со снижением Implied APY
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {impliedDrops.map((alert) => {
              const underlyingApy = underlyingApyMap[alert.pool_id];
              
              return (
                <div
                  key={alert.id}
                  className="p-4 bg-destructive/5 hover:bg-destructive/10 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {getDisplayName(alert.pendle_pools)}
                        </span>
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${
                            isExponentPool(alert.pendle_pools) 
                              ? 'border-orange-500 text-orange-500' 
                              : isSpectraPool(alert.pendle_pools) 
                                ? 'border-purple-500 text-purple-500' 
                                : 'border-primary text-primary'
                          }`}
                        >
                          {getPlatformName(alert.pendle_pools)}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {CHAIN_NAMES[alert.pendle_pools?.chain_id || 1]}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-sm">
                        <span className="text-muted-foreground">
                          {formatPercent(alert.previous_value)}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-destructive font-medium">
                          {formatPercent(alert.current_value)}
                        </span>
                        <Badge
                          variant="outline"
                          className="border-destructive text-destructive font-bold"
                        >
                          {formatChange(alert.change_percent)}
                        </Badge>
                      </div>
                      {/* Underlying APY */}
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <span>Underlying APY:</span>
                        <span className="font-medium text-foreground">
                          {formatPercent(underlyingApy)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(alert.created_at).toLocaleString('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {alert.pendle_pools && (
                        <a
                          href={getMarketUrl(alert.pendle_pools)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-md hover:bg-muted transition-colors"
                          title={`Открыть на ${getPlatformName(alert.pendle_pools)}`}
                        >
                          <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
