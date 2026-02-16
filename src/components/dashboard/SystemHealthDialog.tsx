import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
    Activity,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Loader2,
    RefreshCw,
    Database,
    Globe
} from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import {
    useFetchMarkets,
    useFetchSpectraMarkets,
    useFetchExponentMarkets,
    useFetchRateXMarkets
} from '@/hooks/usePendle';
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';

interface PlatformStatus {
    name: string;
    dbStatus: 'success' | 'warning' | 'error' | 'idle';
    apiStatus: 'success' | 'error' | 'idle' | 'loading';
    lastUpdate?: Date;
    poolCount?: number;
    errorMessage?: string;
}

export const SystemHealthDialog = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [progress, setProgress] = useState(0);

    const fetchPendle = useFetchMarkets();
    const fetchSpectra = useFetchSpectraMarkets();
    const fetchExponent = useFetchExponentMarkets();
    const fetchRateX = useFetchRateXMarkets();

    const [statuses, setStatuses] = useState<Record<string, PlatformStatus>>({
        pendle: { name: 'Pendle', dbStatus: 'idle', apiStatus: 'idle' },
        spectra: { name: 'Spectra', dbStatus: 'idle', apiStatus: 'idle' },
        exponent: { name: 'Exponent', dbStatus: 'idle', apiStatus: 'idle' },
        ratex: { name: 'RateX', dbStatus: 'idle', apiStatus: 'idle' },
    });

    const runDiagnostics = async () => {
        setIsTesting(true);
        setProgress(0);

        const platforms = ['pendle', 'spectra', 'exponent', 'ratex'];

        for (let i = 0; i < platforms.length; i++) {
            const p = platforms[i];
            setProgress((i / platforms.length) * 100);

            // 1. Check Database Freshness
            let query = supabase.from('pendle_pools').select('updated_at', { count: 'exact' });

            if (p === 'spectra') query = query.ilike('name', '%[Spectra]%');
            else if (p === 'exponent') query = query.ilike('name', '%[Exponent]%');
            else if (p === 'ratex') query = query.ilike('name', '%[RateX]%');
            else query = query.not('name', 'ilike', '%[%'); // Pendle is default

            const { data, count, error: dbError } = await query
                .order('updated_at', { ascending: false })
                .limit(1);

            const lastUpdate = data?.[0]?.updated_at ? new Date(data[0].updated_at) : undefined;
            let dbStatus: PlatformStatus['dbStatus'] = 'success';

            if (dbError || !lastUpdate) dbStatus = 'error';
            else {
                const hoursSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60);
                if (hoursSinceUpdate > 24) dbStatus = 'error';
                else if (hoursSinceUpdate > 4) dbStatus = 'warning';
            }

            setStatuses(prev => ({
                ...prev,
                [p]: { ...prev[p], dbStatus, lastUpdate, poolCount: count || 0 }
            }));

            // 2. Check API Connectivity (Live Run)
            setStatuses(prev => ({ ...prev, [p]: { ...prev[p], apiStatus: 'loading' } }));

            let apiStatus: PlatformStatus['apiStatus'] = 'success';
            let errorMessage = '';

            try {
                let result;
                if (p === 'pendle') result = await fetchPendle.mutateAsync();
                else if (p === 'spectra') result = await fetchSpectra.mutateAsync();
                else if (p === 'exponent') result = await fetchExponent.mutateAsync();
                else if (p === 'ratex') result = await fetchRateX.mutateAsync();

                // If result has an error property (from supabase.functions.invoke)
                if (result?.error) {
                    apiStatus = 'error';
                    errorMessage = typeof result.error === 'string'
                        ? result.error
                        : JSON.stringify(result.error);
                }
            } catch (err: any) {
                apiStatus = 'error';
                // Improve error message extraction
                if (err?.context?.status) {
                    errorMessage = `HTTP ${err.context.status}: ${err.message}`;
                } else if (err?.message) {
                    errorMessage = err.message;
                } else {
                    errorMessage = 'Unknown error occurred';
                }
                console.error(`Diagnostic error for ${p}:`, err);
            }

            setStatuses(prev => ({
                ...prev,
                [p]: { ...prev[p], apiStatus, errorMessage }
            }));
        }

        setProgress(100);
        setIsTesting(false);
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'success': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
            case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
            case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
            case 'loading': return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
            default: return <Activity className="h-4 w-4 text-muted-foreground" />;
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Activity className="h-4 w-4" />
                    Диагностика
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Диагностика системы</DialogTitle>
                    <DialogDescription>
                        Проверка актуальности данных и доступности API для всех платформ.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {isTesting && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Выполнение тестов...</span>
                                <span>{Math.round(progress)}%</span>
                            </div>
                            <Progress value={progress} className="h-1" />
                        </div>
                    )}

                    <div className="grid gap-4">
                        {Object.entries(statuses).map(([key, status]) => (
                            <div key={key} className="flex flex-col gap-2 p-3 border rounded-lg bg-card/50">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold">{status.name}</span>
                                        {status.poolCount !== undefined && (
                                            <Badge variant="secondary" className="text-[10px]">
                                                {status.poolCount} пулов
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1.5 text-xs">
                                            <Database className="h-3 w-3 text-muted-foreground" />
                                            {getStatusIcon(status.dbStatus)}
                                        </div>
                                        <div className="flex items-center gap-1.5 text-xs">
                                            <Globe className="h-3 w-3 text-muted-foreground" />
                                            {getStatusIcon(status.apiStatus)}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-between items-center text-[11px] text-muted-foreground">
                                    <span>
                                        {status.lastUpdate
                                            ? `Обновлено ${formatDistanceToNow(status.lastUpdate, { addSuffix: true, locale: ru })}`
                                            : 'Нет данных в базе'}
                                    </span>
                                    {status.apiStatus === 'error' && (
                                        <span className="text-red-400 font-medium cursor-help" title={status.errorMessage}>
                                            Ошибка API
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <Button
                        onClick={runDiagnostics}
                        disabled={isTesting}
                        className="w-full gap-2"
                    >
                        {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Запустить полную проверку
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
