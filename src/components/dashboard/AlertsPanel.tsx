import { useState } from 'react';
import { AlertTriangle, Sparkles, X, ExternalLink, Loader2, Copy, Check } from 'lucide-react';
import { usePendleAlerts, useAnalyzeAlert, useDismissAlert } from '@/hooks/usePendle';
import { getAlertTypeLabel, ALERT_PARAM_LABELS, CHAIN_NAMES, getPlatformName, getMarketUrl, isSpectraPool } from '@/types/pendle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const formatExpiry = (expiry: string | null) => {
  if (!expiry) return '';
  return new Date(expiry).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

// Helper to get display name (underlying asset or fallback to name)
const getDisplayName = (pool: { underlying_asset?: string | null; name?: string } | null | undefined) => {
  if (!pool) return 'Unknown';
  return pool.underlying_asset || pool.name || 'Unknown';
};

// Validate that URL is a safe http/https URL to prevent XSS via javascript: or data: URLs
const isValidHttpUrl = (urlString: string): boolean => {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

// Safely get hostname from URL string
const getSafeHostname = (urlString: string): string => {
  try {
    return new URL(urlString).hostname;
  } catch {
    return 'unknown';
  }
};

export function AlertsPanel() {
  const { data: alerts, isLoading } = usePendleAlerts();
  const analyzeAlert = useAnalyzeAlert();
  const dismissAlert = useDismissAlert();
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const selectedAlert = alerts?.find((a) => a.id === selectedAlertId);

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '—';
    return `${(Number(value) * 100).toFixed(2)}%`;
  };

  const formatChange = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '—';
    const num = Number(value);
    const sign = num >= 0 ? '+' : '';
    return `${sign}${num.toFixed(1)}%`;
  };

  const handleAnalyze = async (alertId: string) => {
    try {
      await analyzeAlert.mutateAsync(alertId);
      toast.success('Анализ завершён');
    } catch (error) {
      toast.error('Ошибка анализа');
      console.error(error);
    }
  };

  const handleDismiss = async (alertId: string) => {
    try {
      await dismissAlert.mutateAsync(alertId);
      toast.success('Алерт скрыт');
      setSelectedAlertId(null);
    } catch (error) {
      toast.error('Ошибка');
      console.error(error);
    }
  };

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(true);
      toast.success('Ссылка скопирована');
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (error) {
      toast.error('Ошибка копирования');
    }
  };

  // Filter out dismissed alerts AND implied_spike alerts (they are in a separate panel)
  const activeAlerts = alerts?.filter((a) => 
    a.status !== 'dismissed' && a.alert_type !== 'implied_spike'
  ) || [];

  if (isLoading) {
    return (
      <div className="rounded-xl bg-card border border-border p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-muted-foreground">Загрузка алертов...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <h3 className="font-semibold">Алерты</h3>
          </div>
        </div>
        <ScrollArea className="h-[600px]">
          {activeAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center px-4">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Нет активных алертов</p>
              <p className="text-sm text-muted-foreground mt-1">
                Алерты появятся при изменении ставок более чем на 20%
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {activeAlerts.map((alert) => (
                <div
                  key={alert.id}
                  onClick={() => setSelectedAlertId(alert.id)}
                  className="p-4 cursor-pointer transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {getDisplayName(alert.pendle_pools)}
                        </span>
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${isSpectraPool(alert.pendle_pools) ? 'border-purple-500 text-purple-500' : 'border-primary text-primary'}`}
                        >
                          {getPlatformName(alert.pendle_pools)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {getAlertTypeLabel(alert.alert_type, alert.change_percent)}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-sm">
                        <span className="text-muted-foreground">
                          {formatPercent(alert.previous_value)}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span
                          className={
                            Number(alert.change_percent) > 0 ? 'text-success' : 'text-destructive'
                          }
                        >
                          {formatPercent(alert.current_value)}
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            Number(alert.change_percent) > 0
                              ? 'border-success text-success'
                              : 'border-destructive text-destructive'
                          }
                        >
                          {formatChange(alert.change_percent)}
                        </Badge>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(alert.created_at).toLocaleString('ru-RU', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {alert.ai_analysis && (
                    <div className="mt-3 p-3 rounded-lg bg-muted/50 text-sm">
                      <div className="flex items-center gap-1.5 text-primary mb-1">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span className="font-medium text-xs">AI Анализ</span>
                      </div>
                      <p className="text-muted-foreground line-clamp-2">{alert.ai_analysis}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <Dialog open={!!selectedAlertId} onOpenChange={() => setSelectedAlertId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <div className="flex items-center gap-2">
                <span>{getDisplayName(selectedAlert?.pendle_pools) || 'Детали алерта'}</span>
                {selectedAlert?.pendle_pools && (
                  <>
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${isSpectraPool(selectedAlert.pendle_pools) ? 'border-purple-500 text-purple-500' : 'border-primary text-primary'}`}
                    >
                      {getPlatformName(selectedAlert.pendle_pools)}
                    </Badge>
                  <a
                      href={getMarketUrl(selectedAlert.pendle_pools)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary/80 transition-colors"
                      title={`Открыть на ${getPlatformName(selectedAlert.pendle_pools)}`}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  </>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>

          {selectedAlert && (
            <div className="space-y-4">
              {/* Рынок: Название, Сеть, Срок, Ссылка */}
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground mb-2">Рынок</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-lg">
                      {getDisplayName(selectedAlert.pendle_pools)}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      <span>{CHAIN_NAMES[selectedAlert.pendle_pools?.chain_id || 1]}</span>
                      {selectedAlert.pendle_pools?.expiry && (
                        <>
                          <span>•</span>
                          <span>Экспирация: {formatExpiry(selectedAlert.pendle_pools.expiry)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {selectedAlert.pendle_pools && (
                    <div className="flex items-center gap-2">
                      <a
                        href={getMarketUrl(selectedAlert.pendle_pools)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Открыть на {getPlatformName(selectedAlert.pendle_pools)}
                      </a>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyUrl(getMarketUrl(selectedAlert.pendle_pools!))}
                        className="gap-1.5"
                      >
                        {copiedUrl ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedUrl ? 'Скопировано' : 'Копировать'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">Тип события</p>
                <p className="font-medium mt-1">
                  {getAlertTypeLabel(selectedAlert.alert_type, selectedAlert.change_percent)}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-muted text-center">
                  <p className="text-sm text-muted-foreground">
                    {ALERT_PARAM_LABELS[selectedAlert.alert_type]?.before || 'Было'}
                  </p>
                  <p className="text-2xl font-bold mt-1 tabular-nums">
                    {formatPercent(selectedAlert.previous_value)}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted text-center">
                  <p className="text-sm text-muted-foreground">
                    {ALERT_PARAM_LABELS[selectedAlert.alert_type]?.after || 'Стало'}
                  </p>
                  <p className="text-2xl font-bold mt-1 tabular-nums text-primary">
                    {formatPercent(selectedAlert.current_value)}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted text-center">
                  <p className="text-sm text-muted-foreground">Изменение</p>
                  <p
                    className={`text-2xl font-bold mt-1 tabular-nums ${
                      Number(selectedAlert.change_percent) > 0 ? 'text-success' : 'text-destructive'
                    }`}
                  >
                    {formatChange(selectedAlert.change_percent)}
                  </p>
                </div>
              </div>

              {selectedAlert.ai_analysis ? (
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-primary">AI Анализ причин</span>
                  </div>
                  <div className="prose prose-sm prose-invert max-w-none">
                    <p className="whitespace-pre-wrap text-foreground">
                      {selectedAlert.ai_analysis}
                    </p>
                  </div>
                  {selectedAlert.sources && selectedAlert.sources.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="text-sm font-medium mb-2">Источники:</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedAlert.sources
                          .filter((source): source is string => 
                            typeof source === 'string' && isValidHttpUrl(source)
                          )
                          .map((source, i) => (
                            <a
                              key={i}
                              href={source}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {getSafeHostname(source)}
                            </a>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-muted border border-border text-center">
                  <p className="text-muted-foreground mb-3">
                    AI анализ ещё не проведён
                  </p>
                  <Button
                    onClick={() => handleAnalyze(selectedAlert.id)}
                    disabled={analyzeAlert.isPending}
                    className="gap-2"
                  >
                    {analyzeAlert.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Провести анализ
                  </Button>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => handleDismiss(selectedAlert.id)}
                  className="gap-2"
                >
                  <X className="h-4 w-4" />
                  Скрыть алерт
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
