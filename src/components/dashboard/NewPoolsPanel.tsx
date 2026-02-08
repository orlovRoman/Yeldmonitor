import { useState } from 'react';
import { Plus, ExternalLink, ArrowUpDown, Calendar } from 'lucide-react';
import { usePendlePools } from '@/hooks/usePendle';
import { CHAIN_NAMES, getPlatformName, getMarketUrl, isSpectraPool, isExponentPool } from '@/types/pendle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

const formatExpiry = (expiry: string | null) => {
  if (!expiry) return '—';
  return new Date(expiry).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatLiquidity = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

type SortBy = 'time' | 'liquidity' | 'expiry';

export function NewPoolsPanel() {
  const { data: pools, isLoading } = usePendlePools();
  const [sortBy, setSortBy] = useState<SortBy>('time');

  // Sort pools - all pools are shown, sorted by creation date by default
  const sortedPools = [...(pools || [])].sort((a, b) => {
    switch (sortBy) {
      case 'time':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'liquidity':
        return (b.latest_rate?.liquidity || 0) - (a.latest_rate?.liquidity || 0);
      case 'expiry':
        if (!a.expiry) return 1;
        if (!b.expiry) return -1;
        return new Date(a.expiry).getTime() - new Date(b.expiry).getTime();
      default:
        return 0;
    }
  });

  if (isLoading) {
    return (
      <div className="rounded-xl bg-card border border-border p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-muted-foreground">Загрузка пулов...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plus className="h-5 w-5 text-success" />
          <h3 className="font-semibold">Все пулы</h3>
          {sortedPools.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {sortedPools.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={sortBy === 'time' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setSortBy('time')}
            className="text-xs h-7 px-2"
          >
            <ArrowUpDown className="h-3 w-3 mr-1" />
            Дата
          </Button>
          <Button
            variant={sortBy === 'liquidity' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setSortBy('liquidity')}
            className="text-xs h-7 px-2"
          >
            Ликвидность
          </Button>
          <Button
            variant={sortBy === 'expiry' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setSortBy('expiry')}
            className="text-xs h-7 px-2"
          >
            Экспирация
          </Button>
        </div>
      </div>
      <ScrollArea className="h-[600px]">
        {sortedPools.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center px-4">
            <Plus className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Нет пулов</p>
            <p className="text-sm text-muted-foreground mt-1">
              Пулы появятся здесь после обновления данных
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sortedPools.map((pool) => (
              <div
                key={pool.id}
                className="p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {pool.underlying_asset || pool.name}
                      </span>
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${
                          isExponentPool(pool) 
                            ? 'border-orange-500 text-orange-500' 
                            : isSpectraPool(pool) 
                              ? 'border-purple-500 text-purple-500' 
                              : 'border-primary text-primary'
                        }`}
                      >
                        {getPlatformName(pool)}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {CHAIN_NAMES[pool.chain_id] || 'Unknown'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 truncate">
                      {pool.name}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Ликвидность:</span>
                        <span className="font-medium text-success">
                          {formatLiquidity(pool.latest_rate?.liquidity)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Экспирация:</span>
                        <span className="font-medium">
                          {formatExpiry(pool.expiry)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(pool.created_at)}</span>
                    </div>
                    <a
                      href={getMarketUrl(pool)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary/80 transition-colors"
                      title={`Открыть на ${getPlatformName(pool)}`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
