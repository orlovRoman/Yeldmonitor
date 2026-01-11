import { Activity, AlertTriangle, Network } from 'lucide-react';
import { useStats } from '@/hooks/usePendle';

export function StatsCards() {
  const { data: stats, isLoading } = useStats();

  const cards = [
    {
      title: 'Активных пулов',
      value: stats?.totalPools || 0,
      icon: Activity,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Новых алертов',
      value: stats?.newAlerts || 0,
      icon: AlertTriangle,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
      pulse: (stats?.newAlerts || 0) > 0,
    },
    {
      title: 'Сетей',
      value: stats?.networkCount || 0,
      icon: Network,
      color: 'text-chart-underlying',
      bgColor: 'bg-secondary',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className={`relative overflow-hidden rounded-xl bg-card border border-border p-5 transition-all hover:border-primary/50 ${
            card.pulse ? 'pulse-alert' : ''
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{card.title}</p>
              <p className="mt-2 text-3xl font-bold tabular-nums">
                {isLoading ? '—' : card.value}
              </p>
            </div>
            <div className={`rounded-lg p-2.5 ${card.bgColor}`}>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </div>
          </div>
          <div className="absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-gradient-to-br from-primary/5 to-transparent" />
        </div>
      ))}
    </div>
  );
}
