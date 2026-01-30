import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Supported chains for Pendle (all available networks)
const SUPPORTED_CHAINS = [
  { chainId: 1, name: 'Ethereum' },
  { chainId: 42161, name: 'Arbitrum' },
  { chainId: 56, name: 'BNB Chain' },
  { chainId: 10, name: 'Optimism' },
  { chainId: 5000, name: 'Mantle' },
  { chainId: 8453, name: 'Base' },
  { chainId: 146, name: 'Sonic' },
  { chainId: 999, name: 'Hyperliquid' },
  { chainId: 21000000, name: 'Corn' },
  { chainId: 80094, name: 'Berachain' },
];

const ALERT_THRESHOLD = 0.20; // 20% change threshold for underlying APY
const IMPLIED_APY_THRESHOLD = 0.01; // 1% change threshold for implied APY

interface PendleMarket {
  address: string;
  name: string;
  expiry: string;
  pt: { address: string };
  yt: { address: string };
  sy: { address: string };
  underlyingAsset: { address: string; symbol: string };
  impliedApy: number;
  underlyingApy: number;
  liquidity: { usd: number };
  tradingVolume: { usd: number };
}

// Verify API key for scheduled job access - MUST have key set
function verifyApiKey(req: Request): boolean {
  const authHeader = req.headers.get('Authorization');
  const expectedKey = Deno.env.get('PENDLE_CRON_API_KEY');
  
  // Require API key to be configured - no fallback to unauthenticated access
  if (!expectedKey) {
    console.error('PENDLE_CRON_API_KEY not configured - blocking access');
    return false;
  }
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  
  const providedKey = authHeader.replace('Bearer ', '');
  return providedKey === expectedKey;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify API key for cron job access
  if (!verifyApiKey(req)) {
    console.error('Unauthorized access attempt to fetch-pendle-markets');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting Pendle markets fetch...');
    const allMarkets: any[] = [];
    const alerts: any[] = [];

    // Fetch markets from all chains
    for (const chain of SUPPORTED_CHAINS) {
      try {
        console.log(`Fetching markets for ${chain.name} (chainId: ${chain.chainId})...`);
        
        const response = await fetch(
          `https://api-v2.pendle.finance/core/v1/${chain.chainId}/markets?order_by=name%3A1&skip=0&limit=100`,
          {
            headers: { 'Accept': 'application/json' }
          }
        );

        if (!response.ok) {
          console.error(`Failed to fetch ${chain.name}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const markets = data.results || data || [];
        
        console.log(`Found ${markets.length} markets on ${chain.name}`);
        
        for (const market of markets) {
          allMarkets.push({
            chainId: chain.chainId,
            chainName: chain.name,
            ...market
          });
        }
      } catch (error) {
        console.error(`Error fetching ${chain.name}:`, error);
      }
    }

    // Filter out expired markets
    const now = new Date();
    const activeMarkets = allMarkets.filter(market => {
      if (!market.expiry) return true; // Keep markets without expiry
      const expiryDate = new Date(market.expiry);
      return expiryDate > now;
    });

    console.log(`Total markets fetched: ${allMarkets.length}, active (non-expired): ${activeMarkets.length}`);

    // Process each active market
    for (const market of activeMarkets) {
      try {
        // Upsert pool
        const { data: poolData, error: poolError } = await supabase
          .from('pendle_pools')
          .upsert({
            chain_id: market.chainId,
            market_address: market.address,
            name: market.name || `${market.underlyingAsset?.symbol || 'Unknown'} Pool`,
            underlying_asset: market.underlyingAsset?.symbol || null,
            pt_address: market.pt?.address || null,
            yt_address: market.yt?.address || null,
            sy_address: market.sy?.address || null,
            expiry: market.expiry || null,
          }, {
            onConflict: 'chain_id,market_address'
          })
          .select('id')
          .single();

        if (poolError) {
          console.error(`Error upserting pool ${market.address}:`, poolError);
          continue;
        }

        const poolId = poolData.id;
        const impliedApy = market.impliedApy || 0;
        const underlyingApy = market.underlyingApy || 0;
        const liquidity = market.liquidity?.usd || 0;
        const volume24h = market.tradingVolume?.usd || 0;

        // Get previous rate for comparison
        const { data: prevRate } = await supabase
          .from('pendle_rates_history')
          .select('implied_apy, underlying_apy')
          .eq('pool_id', poolId)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .single();

        // Insert new rate
        await supabase
          .from('pendle_rates_history')
          .insert({
            pool_id: poolId,
            implied_apy: impliedApy,
            underlying_apy: underlyingApy,
            liquidity: liquidity,
            volume_24h: volume24h,
          });

        // Check for alerts
        if (prevRate) {
          const prevImplied = Number(prevRate.implied_apy) || 0;
          const prevUnderlying = Number(prevRate.underlying_apy) || 0;

          // Check implied APY spike (1% threshold)
          if (prevImplied > 0) {
            const impliedChange = (impliedApy - prevImplied) / prevImplied;
            if (Math.abs(impliedChange) >= IMPLIED_APY_THRESHOLD) {
              alerts.push({
                pool_id: poolId,
                alert_type: 'implied_spike',
                previous_value: prevImplied,
                current_value: impliedApy,
                change_percent: impliedChange * 100, // Keep sign for direction
                pool_name: market.name,
                chain_name: market.chainName,
              });
            }
          }

          // Check underlying APY spike
          if (prevUnderlying > 0) {
            const underlyingChange = Math.abs((underlyingApy - prevUnderlying) / prevUnderlying);
            if (underlyingChange >= ALERT_THRESHOLD) {
              alerts.push({
                pool_id: poolId,
                alert_type: 'underlying_spike',
                previous_value: prevUnderlying,
                current_value: underlyingApy,
                change_percent: underlyingChange * 100,
                pool_name: market.name,
                chain_name: market.chainName,
              });
            }
          }
        }

        // Check yield divergence (underlying > implied significantly)
        // Only create alert if no recent yield_divergence alert exists for this pool (within 24 hours)
        if (impliedApy > 0 && underlyingApy > impliedApy * 1.2) {
          const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { data: existingDivergence } = await supabase
            .from('pendle_alerts')
            .select('id')
            .eq('pool_id', poolId)
            .eq('alert_type', 'yield_divergence')
            .gte('created_at', twentyFourHoursAgo)
            .limit(1);
          
          if (!existingDivergence || existingDivergence.length === 0) {
            alerts.push({
              pool_id: poolId,
              alert_type: 'yield_divergence',
              previous_value: impliedApy,
              current_value: underlyingApy,
              change_percent: ((underlyingApy - impliedApy) / impliedApy) * 100,
              pool_name: market.name,
              chain_name: market.chainName,
            });
          }
        }

      } catch (error) {
        console.error(`Error processing market ${market.address}:`, error);
      }
    }

    console.log(`Generated ${alerts.length} alerts`);

    // Insert alerts (without AI analysis for now, will be analyzed separately)
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
    }

    return new Response(JSON.stringify({
      success: true,
      markets_processed: allMarkets.length,
      alerts_generated: alerts.length,
      alerts: alerts,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in fetch-pendle-markets:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
