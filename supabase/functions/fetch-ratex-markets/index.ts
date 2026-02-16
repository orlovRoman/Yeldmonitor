import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATEX_API_URL = 'https://api.rate-x.io/';

// Threshold for price change alerts (20%)
const PRICE_CHANGE_THRESHOLD = 0.20;

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

    const data = await response.json();
    if (data.code !== 0) {
        throw new Error(`RateX API returned error code ${data.code}: ${data.msg}`);
    }

    return data;
}

// Verify API key for scheduled job access
function verifyAccess(req: Request): boolean {
    const authHeader = req.headers.get('Authorization');
    const expectedKey = Deno.env.get('RATEX_CRON_API_KEY');

    if (!expectedKey) {
        console.log('RATEX_CRON_API_KEY not configured - allowing access');
        return true;
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error('Missing or invalid Authorization header');
        return false;
    }

    const providedKey = authHeader.replace('Bearer ', '');
    return providedKey === expectedKey;
}

serve(async (req) => {
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
                // Upsert pool
                const { data: poolData, error: poolError } = await supabase
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
                    })
                    .select('id')
                    .single();

                if (poolError) {
                    console.error(`Error upserting pool ${market.symbol}:`, poolError);
                    continue;
                }

                const poolId = poolData.id;
                const currentPrice = market.sum_price || 0;

                // Get previous rate for comparison
                const { data: prevRate } = await supabase
                    .from('ratex_rates_history')
                    .select('sum_price')
                    .eq('pool_id', poolId)
                    .order('recorded_at', { ascending: false })
                    .limit(1)
                    .single();

                // Insert new rate snapshot
                await supabase
                    .from('ratex_rates_history')
                    .insert({
                        pool_id: poolId,
                        sum_price: currentPrice,
                        lower_yield: market.initial_lower_yield_range,
                        upper_yield: market.initial_upper_yield_range,
                        earn_w: market.earn_w,
                    });

                // Check for price change alerts
                if (prevRate) {
                    const prevPrice = Number(prevRate.sum_price) || 0;

                    if (prevPrice > 0) {
                        const priceChange = (currentPrice - prevPrice) / prevPrice;
                        if (Math.abs(priceChange) >= PRICE_CHANGE_THRESHOLD) {
                            alerts.push({
                                pool_id: poolId,
                                alert_type: 'price_spike',
                                previous_value: prevPrice,
                                current_value: currentPrice,
                                change_percent: priceChange * 100,
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

        // 5. Insert alerts
        for (const alert of alerts) {
            await supabase
                .from('ratex_alerts')
                .insert({
                    pool_id: alert.pool_id,
                    alert_type: alert.alert_type,
                    previous_value: alert.previous_value,
                    current_value: alert.current_value,
                    change_percent: alert.change_percent,
                });
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
