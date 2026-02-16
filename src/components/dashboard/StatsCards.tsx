import { Activity, Network } from 'lucide-react';
import { usePendlePools } from '@/hooks/usePendle';
import { isSpectraPool, isExponentPool, isRateXPool } from '@/types/pendle';

export function StatsCards() {
  const { data: pools, isLoading } = usePendlePools();

  // Calculate stats with platform breakdown
  const pendlePools = pools?.filter(p => !isSpectraPool(p) && !isExponentPool(p) && !isRateXPool(p)) || [];
  const spectraPools = pools?.filter(p => isSpectraPool(p)) || [];
  const exponentPools = pools?.filter(p => isExponentPool(p)) || [];
  const ratexPools = pools?.filter(p => isRateXPool(p)) || [];

  const pendleNetworks = new Set(pendlePools.map(p => p.chain_id));
  const spectraNetworks = new Set(spectraPools.map(p => p.chain_id));
  const exponentNetworks = new Set(exponentPools.map(p => p.chain_id));
  const ratexNetworks = new Set(ratexPools.map(p => p.chain_id));

  const cards = [
    {
      title: 'Активных пулов',
      pendle: pendlePools.length,
      spectra: spectraPools.length,
      exponent: exponentPools.length,
      ratex: ratexPools.length,
      icon: Activity,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Сетей',
      pendle: pendleNetworks.size,
      spectra: spectraNetworks.size,
      exponent: exponentNetworks.size,
      ratex: ratexNetworks.size,
      icon: Network,
      color: 'text-chart-underlying',
      bgColor: 'bg-secondary',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className="relative overflow-hidden rounded-xl bg-card border border-border p-4 transition-all hover:border-primary/50"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">{card.title}</p>
              <div className="mt-2 flex items-baseline gap-3 flex-wrap">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Pendle:</span>
                  <span className="text-base font-bold tabular-nums">
                    {isLoading ? '—' : card.pendle}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-purple-400">Spectra:</span>
                  <span className="text-base font-bold tabular-nums text-purple-400">
                    {isLoading ? '—' : card.spectra}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-orange-400">Exponent:</span>
                  <span className="text-base font-bold tabular-nums text-orange-400">
                    {isLoading ? '—' : card.exponent}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-blue-400">RateX:</span>
                  <span className="text-base font-bold tabular-nums text-blue-400">
                    {isLoading ? '—' : card.ratex}
                  </span>
                </div>
              </div>
            </div>
            <div className={`rounded-lg p-2 ${card.bgColor}`}>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
