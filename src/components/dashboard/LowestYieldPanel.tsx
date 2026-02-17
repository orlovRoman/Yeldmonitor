import { TrendingDown, ExternalLink } from 'lucide-react';
import { usePendlePools } from '@/hooks/usePendle';
import { CHAIN_NAMES, getPlatformName, getMarketUrl, isSpectraPool, isExponentPool, isRateXPool } from '@/types/pendle';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

const getDisplayName = (pool: { underlying_asset?: string | null; name?: string } | null | undefined) => {
    if (!pool) return 'Unknown';
    return pool.underlying_asset || pool.name || 'Unknown';
};

const isValidHttpUrl = (urlString: string): boolean => {
    try {
        const url = new URL(urlString);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
};

const getSafeHostname = (urlString: string): string => {
    try {
        return new URL(urlString).hostname;
    } catch {
        return 'unknown';
    }
};

export function LowestYieldPanel() {
    const { data: pools, isLoading } = usePendlePools();

    const formatPercent = (value: number | null | undefined) => {
        if (value === null || value === undefined) return '—';
        return `${(Number(value) * 100).toFixed(2)}%`;
    };

    const formatLiquidity = (value: number | null | undefined) => {
        if (value === null || value === undefined) return '—';
        if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
        if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
        return `$${value.toFixed(0)}`;
    };

    // Sort by implied_apy ascending (lowest first) and take top 10
    const lowestYieldPools = (pools || [])
        .filter(pool => pool.latest_rate && pool.latest_rate.implied_apy > 0)
        .sort((a, b) => {
            const apyA = a.latest_rate?.implied_apy || 0;
            const apyB = b.latest_rate?.implied_apy || 0;
            return apyA - apyB;
        })
        .slice(0, 10);

    if (isLoading) {
        return (
            <div className="rounded-xl bg-card border border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-semibold text-sm">Низкая доходность</h3>
                </div>
                <div className="flex items-center justify-center h-48">
                    <div className="animate-pulse text-muted-foreground text-xs">Загрузка...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-xl bg-card border border-border overflow-hidden">
            <div className="p-3 border-b border-border">
                <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-semibold text-sm">Низкая доходность</h3>
                    <Badge variant="outline" className="text-xs ml-auto">
                        Top 10
                    </Badge>
                </div>
            </div>
            <ScrollArea className="h-[280px]">
                {lowestYieldPools.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-center px-4">
                        <TrendingDown className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-muted-foreground text-xs">Нет данных о доходности</p>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {lowestYieldPools.map((pool) => (
                            <div key={pool.id} className="p-2.5 hover:bg-muted/30 transition-colors">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-medium text-xs truncate">
                                                {getDisplayName(pool)}
                                            </span>
                                            <Badge
                                                variant="outline"
                                                className={`text-[10px] px-1 py-0 h-5 ${isRateXPool(pool)
                                                        ? 'border-blue-500 text-blue-500'
                                                        : isExponentPool(pool)
                                                            ? 'border-orange-500 text-orange-500'
                                                            : isSpectraPool(pool)
                                                                ? 'border-purple-500 text-purple-500'
                                                                : 'border-primary text-primary'
                                                    }`}
                                            >
                                                {getPlatformName(pool)}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] text-muted-foreground">
                                                {CHAIN_NAMES[pool.chain_id] || pool.chain_id}
                                            </span>
                                            {pool.expiry && (
                                                <span className="text-[10px] text-muted-foreground">
                                                    • {new Date(pool.expiry).toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' })}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-xs font-bold text-destructive">
                                            {formatPercent(pool.latest_rate?.implied_apy)}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground">
                                            {formatLiquidity(pool.latest_rate?.liquidity)}
                                        </div>
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
