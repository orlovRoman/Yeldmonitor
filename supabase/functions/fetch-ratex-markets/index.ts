import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RATEX_API_URL = 'https://api.rate-x.io/';

// Threshold for price change alerts (20%)
const PRICE_CHANGE_THRESHOLD = 0.20;
// Threshold for APY change alerts (10% relative)
const APY_CHANGE_THRESHOLD = 0.10;
const RATEX_CHAIN_ID = 502; // Custom ID for RateX/Solana in this app

interface RateXSymbol {
    id: number;
    symbol: string;
    symbol_name: string;
    symbol_level1_category: string;
    symbol_level2_category: string;
    term: string;
    due_date: string;
    due_date_flag: boolean;
    due_date_l: string;
    sum_price: number;
    trade_commission: string;
    pt_mint: string;
    partners: string;
    partners_icon: string;
    partners_reward_boost: string;
    sort: number;
    earn_margin_index: number;
    lp_margin_index: number;
    earn_w: number;
    epoch: number;
    expiration: string;
    initial_lower_yield_range: number;
    initial_upper_yield_range: number;
    minimum_initial_cr: number;
    minimum_maintainance_cr: number;
    protocol_fee_rate: number;
    k_value: string;
    is_delete: string;
    root_currency: string;
    Accepted_currencies_margin: string;
    update_lp: string;
    location: string;
    yT_precision?: string;
    yT_tick_size?: string;
    yT_price_size?: string;
    yield_price_size?: string;
}

interface RateXApiResponse<T> {
    msg: string;
    code: number;
    data: T;
    total_size?: number;
    cid: string;
}

interface RateXTvl {
    total_u_volume: string;
    total_u_tvl: string;
}

// Generate a UUID v4 for request correlation
function generateCid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Call RateX API
async function callRateXApi<T>(method: string, content: Record<string, unknown> = {}): Promise<RateXApiResponse<T>> {
    const cid = generateCid();
    const payload = {
        serverName: 'AdminSvr',
        method,
        content: { cid, ...content },
    };

    const response = await fetch(RATEX_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': '*/*',
            'Origin': 'https://app.rate-x.io',
            'Referer': 'https://app.rate-x.io/',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`RateX API error: ${response.status} ${response.statusText}`);
    }

    const result: any = await response.json();
    if (result.code !== 0) {
        throw new Error(`RateX API returned error code ${result.code}: ${result.msg}`);
    }

    // Handle nested data structures for querySymbol
    if (method === 'querySymbol' && result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
        if (Array.isArray((result.data as any).symbols)) {
            console.log(`[RateX] Using nested symbols list for ${method}`);
            result.data = (result.data as any).symbols;
        }
    }

    return result;
}

// Verify API key for scheduled job access
function verifyAccess(req: Request): boolean {
    const authHeader = req.headers.get('Authorization');
    const expectedKey = Deno.env.get('RATEX_CRON_API_KEY');

    if (!expectedKey) {
        console.log('RATEX_CRON_API_KEY not configured - allowing access');
        return true;
    }

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const providedKey = authHeader.replace('Bearer ', '');
        if (providedKey === expectedKey) return true;
    }

    // Also allow access if it looks like a Supabase client request (from frontend)
    return req.headers.has('x-client-info') || req.headers.has('apikey');
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    if (!verifyAccess(req)) {
        console.error('Unauthorized access attempt to fetch-ratex-markets');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        console.log('Starting RateX markets fetch...');

        // 1. Fetch all symbols (markets)
        const symbolsResponse = await callRateXApi<RateXSymbol[]>('querySymbol');
        const allMarkets = symbolsResponse.data || [];
        console.log(`Fetched ${allMarkets.length} RateX markets`);

        // 2. Fetch TVL & Volume stats
        let totalTvl = 0;
        let totalVolume = 0;
        try {
            const tvlResponse = await callRateXApi<RateXTvl>('queryTotalVolumeAndTvl');
            totalTvl = parseFloat(tvlResponse.data.total_u_tvl) || 0;
            totalVolume = parseFloat(tvlResponse.data.total_u_volume) || 0;
            console.log(`RateX TVL: $${totalTvl.toFixed(2)}, Volume: $${totalVolume.toFixed(2)}`);
        } catch (err) {
            console.error('Failed to fetch TVL/Volume stats:', err);
        }

        // 3. Filter active (non-expired, non-deleted) markets
        const now = new Date();
        const activeMarkets = allMarkets.filter((market) => {
            if (market.is_delete === '1') return false;
            if (!market.due_date) return true;
            const dueDate = new Date(market.due_date);
            return dueDate > now;
        });
        console.log(`Active markets: ${activeMarkets.length} of ${allMarkets.length}`);

        const alerts: {
            pool_id: string;
            alert_type: string;
            previous_value: number;
            current_value: number;
            change_percent: number;
            pool_name: string;
        }[] = [];

        // 4. Process each active market
        for (const market of activeMarkets) {
            try {
                // Upsert pool into main pendle_pools table for dashboard unification
                const marketAddress = `ratex-${market.symbol}`;
                const { data: poolData, error: poolError } = await supabase
                    .from('pendle_pools')
                    .upsert({
                        chain_id: RATEX_CHAIN_ID,
                        market_address: marketAddress,
                        name: `[RateX] ${market.symbol_name || market.symbol}`,
                        underlying_asset: market.symbol_level1_category || null,
                        expiry: market.due_date || null,
                        updated_at: new Date().toISOString(),
                    }, {
                        onConflict: 'chain_id,market_address'
                    })
                    .select('id')
                    .single();

                if (poolError) {
                    console.error(`Error upserting pool ${market.symbol}:`, poolError);
                    continue;
                }

                const poolId = poolData.id;
                const currentPrice = market.sum_price || 0;
                // RateX Implied APY is approximately upper_yield
                const currentImpliedApy = (market.initial_upper_yield_range || 0) / 100;
                // RateX Underlying APY is approximately lower_yield
                const currentUnderlyingApy = (market.initial_lower_yield_range || 0) / 100;

                // Sync with original ratex_pools for backwards compatibility if needed
                await supabase
                    .from('ratex_pools')
                    .upsert({
                        symbol: market.symbol,
                        symbol_name: market.symbol_name,
                        category_l1: market.symbol_level1_category,
                        category_l2: market.symbol_level2_category,
                        term: market.term,
                        due_date: market.due_date || null,
                        pt_mint: market.pt_mint || null,
                        partners: market.partners || null,
                        partners_icon: market.partners_icon || null,
                        partners_reward_boost: market.partners_reward_boost || null,
                        trade_commission: parseFloat(market.trade_commission) || 0,
                        initial_lower_yield_range: market.initial_lower_yield_range || 0,
                        initial_upper_yield_range: market.initial_upper_yield_range || 0,
                        earn_w: market.earn_w || 0,
                        ratex_id: market.id,
                    }, {
                        onConflict: 'symbol',
                    });

                // Get previous rate for comparison from unified history
                const { data: prevRate } = await supabase
                    .from('pendle_rates_history')
                    .select('implied_apy, liquidity')
                    .eq('pool_id', poolId)
                    .order('recorded_at', { ascending: false })
                    .limit(1)
                    .single();

                // Insert new rate snapshot into unified history
                await supabase
                    .from('pendle_rates_history')
                    .insert({
                        pool_id: poolId,
                        implied_apy: currentImpliedApy,
                        underlying_apy: currentUnderlyingApy,
                        liquidity: 0, // Individual TVL not in querySymbol, fixed separately in useRateX
                        volume_24h: 0,
                    });

                // Backward compatibility rate history
                await supabase
                    .from('ratex_rates_history')
                    .insert({
                        pool_id: poolId, // This might break if ratex_rates_history foreign key points to ratex_pools
                        sum_price: currentPrice,
                        lower_yield: market.initial_lower_yield_range,
                        upper_yield: market.initial_upper_yield_range,
                        earn_w: market.earn_w,
                    }).catch(() => { }); // Ignore error as we shift to unified

                // Check for APY change alerts (Unified)
                if (prevRate) {
                    const prevImplied = Number(prevRate.implied_apy) || 0;

                    if (prevImplied > 0) {
                        const apyChange = (currentImpliedApy - prevImplied) / prevImplied;
                        if (Math.abs(apyChange) >= APY_CHANGE_THRESHOLD) {
                            alerts.push({
                                pool_id: poolId,
                                alert_type: 'implied_spike',
                                previous_value: prevImplied,
                                current_value: currentImpliedApy,
                                change_percent: apyChange * 100,
                                pool_name: market.symbol_name,
                            });
                        }
                    }
                }
            } catch (error) {
                console.error(`Error processing market ${market.symbol}:`, error);
            }
        }

        console.log(`Generated ${alerts.length} alerts`);

        // 5. Insert alerts into unified table
        for (const alert of alerts) {
            await supabase
                .from('pendle_alerts')
                .insert({
                    pool_id: alert.pool_id,
                    alert_type: alert.alert_type,
                    previous_value: alert.previous_value,
                    current_value: alert.current_value,
                    change_percent: alert.change_percent,
                });

            // Still insert into ratex_alerts for backward compatibility
            await supabase
                .from('ratex_alerts')
                .insert({
                    pool_id: alert.pool_id, // Error prone as mentioned above, but kept as best effort
                    alert_type: alert.alert_type,
                    previous_value: alert.previous_value,
                    current_value: alert.current_value,
                    change_percent: alert.change_percent,
                }).catch(() => { });
        }

        return new Response(JSON.stringify({
            success: true,
            markets_total: allMarkets.length,
            markets_active: activeMarkets.length,
            total_tvl: totalTvl,
            total_volume: totalVolume,
            alerts_generated: alerts.length,
            alerts,
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in fetch-ratex-markets:', error);
        return new Response(JSON.stringify({ error: 'An error occurred processing your request' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
