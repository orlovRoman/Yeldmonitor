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

// Global debug helper for the user
if (typeof window !== 'undefined') {
    (window as any).ratexDebug = async () => {
        console.log('[RateX Debug] Manually fetching querySymbol...');
        try {
            const response = await fetch('/ratex-api/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    serverName: 'AdminSvr',
                    method: 'querySymbol',
                    content: { cid: 'manual-debug' }
                })
            });
            const data = await response.json();
            console.log('[RateX Debug] Raw Response:', data);
            return data;
        } catch (e) {
            console.error('[RateX Debug] Manual fetch failed:', e);
        }
    };
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
    due_date_l?: string;
    due_date_flag: boolean;
    sum_price: number;
    trade_commission: string;
    pt_mint: string;
    partners: string[]; // Changed from string to string[]
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

export interface RateXRewardRate {
    symbol: string;
    term: string;
    apy: string;
    apr: string;
    tvl: string;
    st_volume: string;
    create_time: string;
    reward_rate: string;
    trade_date: string;
}

interface RateXApiResponse<T> {
    msg: string;
    code: number;
    data: T;
    cid: string;
}

// Exported for use in usePendle.ts
export async function callRateXApi<T>(method: string, params: any = {}): Promise<T> {
    const cid = generateCid();
    console.log(`[RateX] Calling ${method}...`, { url: RATEX_API_URL, cid });

    try {
        const response = await fetch(RATEX_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': '*/*',
            },
            body: JSON.stringify({
                serverName: 'AdminSvr',
                method,
                content: {
                    cid,
                    ...params
                },
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[RateX] API response not OK: ${response.status} ${response.statusText}`, { body: errorBody });
            throw new Error(`RateX API error: ${response.statusText}`);
        }

        const result: any = await response.json();

        if (result.code !== 0) {
            console.error(`[RateX] API business error:`, { code: result.code, msg: result.msg });
            throw new Error(result.msg || 'RateX API internal error');
        }

        // Handle various response data structures
        let data = result.data;
        console.log(`[RateX] Data received for ${method}:`, { type: typeof data, isArray: Array.isArray(data) });

        if (method === 'querySymbol') {
            // Priority 1: Direct array
            if (Array.isArray(data)) return data as T;

            // Priority 2: Nested symbols array (Specific to RateX)
            if (data && typeof data === 'object' && Array.isArray((data as any).symbols)) {
                console.log(`[RateX] Using nested symbols list for ${method}`);
                return (data as any).symbols as T;
            }

            // Priority 3: Nested list array
            if (data && typeof data === 'object' && Array.isArray((data as any).list)) {
                console.log(`[RateX] Using nested list for ${method}`);
                return (data as any).list as T;
            }

            // Priority 4: Object where values are markets
            if (data && typeof data === 'object') {
                const values = Object.values(data);
                if (values.length > 0 && (values[0] as any).symbol) {
                    console.log(`[RateX] Converting object values to array for ${method}`);
                    return values as T;
                }
            }
        }

        return data;
    } catch (err) {
        console.error(`[RateX] Fetch error for ${method}:`, err);
        throw err;
    }
}

export async function fetchRateXPoolStats(): Promise<RateXRewardRate[]> {
    return callRateXApi<RateXRewardRate[]>('querySolanaTermRewardRate');
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

                // Use UTC timestamp if available for more reliable comparison
                if (m.due_date_l) {
                    return Number(m.due_date_l) > now.getTime();
                }

                if (!m.due_date) return true;
                // Handle "24:00:00" format which is common in RateX API but invalid for new Date()
                const dateStr = m.due_date.replace(' 24:00:00', ' 23:59:59');
                const marketDate = new Date(dateStr);
                return isNaN(marketDate.getTime()) || marketDate > now;
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
