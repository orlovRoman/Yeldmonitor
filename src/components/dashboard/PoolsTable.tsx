import { useState } from 'react';
import { ExternalLink, TrendingUp, TrendingDown, Clock } from 'lucide-react';
import { usePendlePools } from '@/hooks/usePendle';
import { CHAIN_NAMES, CHAIN_COLORS } from '@/types/pendle';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface PoolsTableProps {
  onSelectPool: (poolId: string) => void;
  selectedPoolId: string | null;
}

export function PoolsTable({ onSelectPool, selectedPoolId }: PoolsTableProps) {
  const { data: pools, isLoading } = usePendlePools();
  const [sortBy, setSortBy] = useState<'apy' | 'liquidity' | 'name'>('liquidity');

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '—';
    return `${(Number(value) * 100).toFixed(2)}%`;
  };

  const formatLiquidity = (value: number | null | undefined) => {
    if (!value) return '—';
    const num = Number(value);
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
    return `$${num.toFixed(0)}`;
  };

  const formatExpiry = (expiry: string | null) => {
    if (!expiry) return '—';
    const date = new Date(expiry);
    const now = new Date();
    const daysLeft = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return 'Истёк';
    if (daysLeft === 0) return 'Сегодня';
    if (daysLeft <= 7) return `${daysLeft}д`;
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  const sortedPools = [...(pools || [])].sort((a, b) => {
    if (sortBy === 'liquidity') {
      return (Number(b.latest_rate?.liquidity) || 0) - (Number(a.latest_rate?.liquidity) || 0);
    }
    if (sortBy === 'apy') {
      return (Number(b.latest_rate?.implied_apy) || 0) - (Number(a.latest_rate?.implied_apy) || 0);
    }
    return a.name.localeCompare(b.name);
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

  if (!pools?.length) {
    return (
      <div className="rounded-xl bg-card border border-border p-6">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Нет данных о пулах</p>
          <p className="text-sm text-muted-foreground mt-1">Нажмите "Обновить данные" для загрузки</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card border border-border overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold">Пулы Pendle</h3>
        <div className="flex gap-2">
          {(['liquidity', 'apy', 'name'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                sortBy === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'liquidity' ? 'Ликвидность' : s === 'apy' ? 'APY' : 'Название'}
            </button>
          ))}
        </div>
      </div>
      <ScrollArea className="h-[400px]">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[200px]">Пул</TableHead>
              <TableHead>Сеть</TableHead>
              <TableHead className="text-right">Implied APY</TableHead>
              <TableHead className="text-right">Underlying APY</TableHead>
              <TableHead className="text-right">Ликвидность</TableHead>
              <TableHead className="text-right">Экспирация</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedPools.map((pool) => {
              const impliedApy = Number(pool.latest_rate?.implied_apy) || 0;
              const underlyingApy = Number(pool.latest_rate?.underlying_apy) || 0;
              const isSelected = pool.id === selectedPoolId;
              const apyDiff = impliedApy - underlyingApy;

              return (
                <TableRow
                  key={pool.id}
                  onClick={() => onSelectPool(pool.id)}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'
                  }`}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span className="truncate max-w-[150px]">{pool.name}</span>
                      <a
                        href={`https://app.pendle.finance/trade/pools/${pool.market_address}?chain=${pool.chain_id === 1 ? 'ethereum' : pool.chain_id === 42161 ? 'arbitrum' : 'ethereum'}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-muted-foreground hover:text-primary"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                    {pool.underlying_asset && (
                      <span className="text-xs text-muted-foreground">{pool.underlying_asset}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      style={{ borderColor: CHAIN_COLORS[pool.chain_id] || '#888' }}
                      className="text-xs"
                    >
                      {CHAIN_NAMES[pool.chain_id] || `Chain ${pool.chain_id}`}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <span className="text-primary">{formatPercent(impliedApy)}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-chart-underlying">{formatPercent(underlyingApy)}</span>
                      {apyDiff !== 0 && (
                        apyDiff > 0 ? (
                          <TrendingUp className="h-3 w-3 text-success" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-destructive" />
                        )
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {formatLiquidity(pool.latest_rate?.liquidity)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span className="text-sm">{formatExpiry(pool.expiry)}</span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}
