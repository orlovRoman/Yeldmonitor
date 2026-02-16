import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Use local proxy to avoid CORS issues
const RATEX_API_URL = '/ratex-api/';

// Generate UUID v4
function generateCid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Export the interface so it can be used in usePendle.ts
export interface RateXMarket {
    id: number;
    symbol: string;
    symbol_name: string;
    symbol_level1_category: string;
    symbol_level2_category: string;
    term: string;
    due_date: string;
    due_date_flag: boolean;
    sum_price: number;
    trade_commission: string;
    pt_mint: string;
    partners: string;
    partners_icon: string;
    partners_reward_boost: string;
    initial_lower_yield_range: number;
    initial_upper_yield_range: number;
    earn_w: number;
    is_delete: string;
}

interface RateXTvlData {
    total_u_volume: string;
    total_u_tvl: string;
}

interface RateXApiResponse<T> {
    msg: string;
    code: number;
    data: T;
    cid: string;
}

// Exported for use in usePendle.ts
export async function callRateXApi<T>(method: string): Promise<T> {
    const response = await fetch(RATEX_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': '*/*',
        },
        body: JSON.stringify({
            serverName: 'AdminSvr',
            method,
            content: { cid: generateCid() },
        }),
    });

    if (!response.ok) {
        throw new Error(`RateX API error: ${response.status}`);
    }

    const result: RateXApiResponse<T> = await response.json();
    if (result.code !== 0) {
        throw new Error(`RateX API error: ${result.msg}`);
    }
    return result.data;
}

export function useRateXMarkets() {
    return useQuery({
        queryKey: ['ratex-markets'],
        queryFn: async () => {
            const data = await callRateXApi<RateXMarket[]>('querySymbol');

            // Safety check to ensure data is an array
            const allMarkets = Array.isArray(data) ? data : [];

            // Filter active (non-expired, non-deleted) markets
            const now = new Date();
            const activeMarkets = allMarkets.filter((m) => {
                if (m.is_delete === '1') return false;
                if (!m.due_date) return true;
                return new Date(m.due_date) > now;
            });

            return activeMarkets;
        },
        refetchInterval: 60000, // 1 minute
        staleTime: 30000,
    });
}

export function useRateXStats() {
    return useQuery({
        queryKey: ['ratex-stats'],
        queryFn: async () => {
            const data = await callRateXApi<RateXTvlData>('queryTotalVolumeAndTvl');
            return {
                totalTvl: parseFloat(data.total_u_tvl) || 0,
                totalVolume: parseFloat(data.total_u_volume) || 0,
            };
        },
        refetchInterval: 60000,
        staleTime: 30000,
    });
}
