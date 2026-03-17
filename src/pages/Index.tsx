import { useState } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatsCards } from '@/components/dashboard/StatsCards';
import { AlertsPanel } from '@/components/dashboard/AlertsPanel';
import { NewPoolsPanel } from '@/components/dashboard/NewPoolsPanel';
import { ImpliedDropsPanel } from '@/components/dashboard/ImpliedDropsPanel';
import { LowestYieldPanel } from '@/components/dashboard/LowestYieldPanel';
import { PlatformFilter, type PlatformFilterValue } from '@/components/dashboard/PlatformFilter';
import {
  useFetchMarkets,
  useFetchSpectraMarkets,
  useFetchExponentMarkets,
  useFetchRateXMarkets
} from '@/hooks/usePendle';
import { toast } from 'sonner';
import { SystemHealthDialog } from '@/components/dashboard/SystemHealthDialog';
import { TelegramSettingsDialog } from '@/components/dashboard/TelegramSettingsDialog';

const Index = () => {
  const [platformFilter, setPlatformFilter] = useState<PlatformFilterValue>('all');
  const fetchMarkets = useFetchMarkets();
  const fetchSpectra = useFetchSpectraMarkets();
  const fetchExponent = useFetchExponentMarkets();
  const fetchRateX = useFetchRateXMarkets();

  const isLoading = fetchMarkets.isPending ||
    fetchSpectra.isPending ||
    fetchExponent.isPending ||
    fetchRateX.isPending;

  const handleRefreshAll = async () => {
    try {
      const [pendleResult, spectraResult, exponentResult, ratexResult] = await Promise.all([
        fetchMarkets.mutateAsync(),
        fetchSpectra.mutateAsync(),
        fetchExponent.mutateAsync(),
        fetchRateX.mutateAsync(),
      ]);
      toast.success(
        `Pendle: ${pendleResult.markets_processed} пулов. Spectra: ${spectraResult.pools_scraped} пулов. Exponent: ${exponentResult.pools_scraped} пулов. RateX: ${ratexResult.pools_scraped || 'обновлен'}.`
      );
    } catch (error) {
      toast.error('Ошибка обновления данных');
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="w-full px-4 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <span className="text-xl font-bold text-primary-foreground">Y</span>
            </div>
            <div>
              <h1 className="text-xl font-bold gradient-text">Yield Monitor</h1>
              <p className="text-xs text-muted-foreground">Pendle + Spectra + Exponent + RateX</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TelegramSettingsDialog />
            <SystemHealthDialog />
            <Button
              onClick={handleRefreshAll}
              disabled={isLoading}
              variant="outline"
              className="gap-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Обновить
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-4 md:px-8 py-6 space-y-6">
        <StatsCards />
        <PlatformFilter value={platformFilter} onChange={setPlatformFilter} />
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          <AlertsPanel platformFilter={platformFilter} />
          <ImpliedDropsPanel platformFilter={platformFilter} />
          <NewPoolsPanel platformFilter={platformFilter} />
          <LowestYieldPanel platformFilter={platformFilter} />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12 py-6">
        <div className="w-full px-4 md:px-8 text-center text-sm text-muted-foreground">
          <p>Данные обновляются каждые 15 минут • Порог алерта: 1% изменение</p>
          <p className="mt-1">Powered by Pendle + Spectra + Exponent + RateX Finance</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
