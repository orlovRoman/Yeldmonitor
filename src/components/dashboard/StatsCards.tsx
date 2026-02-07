import { Activity, Network } from 'lucide-react';
import { usePendlePools } from '@/hooks/usePendle';

export function StatsCards() {
  const { data: pools, isLoading } = usePendlePools();

  // Calculate stats with platform breakdown
  const pendlePools = pools?.filter(p => !p.name?.startsWith('[Spectra]')) || [];
  const spectraPools = pools?.filter(p => p.name?.startsWith('[Spectra]')) || [];

  const pendleNetworks = new Set(pendlePools.map(p => p.chain_id));
  const spectraNetworks = new Set(spectraPools.map(p => p.chain_id));

  const cards = [
    {
      title: 'Активных пулов',
      pendle: pendlePools.length,
      spectra: spectraPools.length,
      icon: Activity,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Сетей',
      pendle: pendleNetworks.size,
      spectra: spectraNetworks.size,
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
              <div className="mt-2 flex items-baseline gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Pendle:</span>
                  <span className="text-lg font-bold tabular-nums">
                    {isLoading ? '—' : card.pendle}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-purple-400">Spectra:</span>
                  <span className="text-lg font-bold tabular-nums text-purple-400">
                    {isLoading ? '—' : card.spectra}
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
