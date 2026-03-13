import { useState } from 'react';
import { Plus, ExternalLink, ArrowUpDown, Calendar } from 'lucide-react';
import { usePendlePools } from '@/hooks/usePendle';
import { CHAIN_NAMES, getPlatformName, getMarketUrl, isSpectraPool, isExponentPool, isRateXPool } from '@/types/pendle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

const formatExpiry = (expiry: string | null) => {
  if (!expiry) return '—';
  return new Date(expiry).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
};

const formatLiquidity = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

const formatApy = (value: number | null | undefined) => {
  if (value === null || value === undefined || value === 0) return null;
  return `${(value * 100).toFixed(2)}%`;
};

type SortBy = 'time' | 'liquidity' | 'expiry';
type DaysFilter = 7 | 14 | 30;

const PLATFORM_COLORS: Record<string, string> = {
  Pendle: 'border-primary text-primary',
  Spectra: 'border-purple-500 text-purple-500',
  Exponent: 'border-orange-500 text-orange-500',
  RateX: 'border-blue-500 text-blue-500',
};

import type { PlatformFilterValue } from './PlatformFilter';

export function NewPoolsPanel({ platformFilter = 'all' }: { platformFilter?: PlatformFilterValue }) {
  const { data: pools, isLoading } = usePendlePools();
  const [sortBy, setSortBy] = useState<SortBy>('time');
  const [daysFilter, setDaysFilter] = useState<DaysFilter>(30);

  const cutoff = new Date(Date.now() - daysFilter * 24 * 60 * 60 * 1000);

  // Only show non-RateX pools that appeared within the selected window
  const newPools = (pools || []).filter(pool => {
    if (new Date(pool.created_at) < cutoff) return false;
    if (platformFilter !== 'all' && getPlatformName(pool) !== platformFilter) return false;
    return true;
  });

  const sortedPools = [...newPools].sort((a, b) => {
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
          <div className="animate-pulse text-muted-foreground">Загрузка...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-success" />
            <h3 className="font-semibold text-base">Новые рынки</h3>
            {sortedPools.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {sortedPools.length}
              </Badge>
            )}
          </div>
          {/* Days filter */}
          <div className="flex items-center gap-1">
            {([7, 14, 30] as DaysFilter[]).map(d => (
              <Button
                key={d}
                variant={daysFilter === d ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setDaysFilter(d)}
                className="text-xs h-7 px-2"
              >
                {d}д
              </Button>
            ))}
          </div>
        </div>
        {/* Sort buttons */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">Сортировка:</span>
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

      <ScrollArea className="h-[560px]">
        {sortedPools.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center px-4">
            <Plus className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground font-medium">Новых рынков нет</p>
            <p className="text-sm text-muted-foreground mt-1">
              За последние {daysFilter} дней новых пулов не появилось
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sortedPools.map((pool) => {
              const platform = getPlatformName(pool);
              const url = getMarketUrl(pool);
              const impliedApy = formatApy(pool.latest_rate?.implied_apy);
              const underlyingApy = formatApy(pool.latest_rate?.underlying_apy);
              const colorClass = PLATFORM_COLORS[platform] || 'border-primary text-primary';

              return (
                <a
                  key={pool.id}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors group"
                >
                  {/* Left: name + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate">
                        {pool.underlying_asset || pool.name}
                      </span>
                      <Badge variant="outline" className={`text-xs shrink-0 ${colorClass}`}>
                        {platform}
                      </Badge>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {CHAIN_NAMES[pool.chain_id] || 'Unknown'}
                      </Badge>
                    </div>
                    {/* Stats row */}
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      {impliedApy && (
                        <span className="text-success font-medium">Impl: {impliedApy}</span>
                      )}
                      {underlyingApy && (
                        <span className="text-primary font-medium">Undrl: {underlyingApy}</span>
                      )}
                      <span>
                        <span className="opacity-70">Ликв: </span>
                        <span className="font-medium text-foreground">
                          {formatLiquidity(pool.latest_rate?.liquidity)}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 opacity-70" />
                        <span className="font-medium text-foreground">
                          {formatExpiry(pool.expiry)}
                        </span>
                      </span>
                      <span className="opacity-60">
                        добавлен {new Date(pool.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>

                  {/* Right: external link icon */}
                  <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
                </a>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
