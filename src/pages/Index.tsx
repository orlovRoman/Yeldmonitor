import { RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatsCards } from '@/components/dashboard/StatsCards';
import { NewPoolsPanel } from '@/components/dashboard/NewPoolsPanel';
import { ImpliedDropsPanel } from '@/components/dashboard/ImpliedDropsPanel';
import { useFetchMarkets } from '@/hooks/usePendle';
import { toast } from 'sonner';

const Index = () => {
  const fetchMarkets = useFetchMarkets();

  const handleRefresh = async () => {
    try {
      const result = await fetchMarkets.mutateAsync();
      toast.success(`Обновлено ${result.markets_processed} пулов, ${result.alerts_generated} новых алертов`);
    } catch (error) {
      toast.error('Ошибка обновления данных');
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <span className="text-xl font-bold text-primary-foreground">P</span>
            </div>
            <div>
              <h1 className="text-xl font-bold gradient-text">Pendle Yield Monitor</h1>
              <p className="text-xs text-muted-foreground">Мониторинг доходности с AI-аналитикой</p>
            </div>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={fetchMarkets.isPending}
            className="gap-2"
          >
            {fetchMarkets.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Обновить данные
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        <StatsCards />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ImpliedDropsPanel />
          <NewPoolsPanel />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Данные обновляются каждые 15 минут • Порог алерта: 20% изменение</p>
          <p className="mt-1">Powered by Pendle Finance API + Perplexity AI</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
