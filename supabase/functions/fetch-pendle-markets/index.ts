import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function notifyTelegram(chatId: number, message: string) {
  const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!TELEGRAM_BOT_TOKEN) return;
  
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    });
  } catch (e) {
    console.error('Telegram send error:', e);
  }
}

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

const CHAIN_SLUGS: Record<number, string> = {
  1: 'ethereum',
  42161: 'arbitrum',
  56: 'bnbchain',
  10: 'optimism',
  5000: 'mantle',
  8453: 'base',
  146: 'sonic',
  999: 'hyperliquid',
  21000000: 'corn',
  80094: 'berachain',
};

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

// Verify API key for scheduled job access
// Returns true if: API key matches, OR no API key is configured (allows frontend access)
function verifyAccess(req: Request): boolean {
  const authHeader = req.headers.get('Authorization');
  const expectedKey = Deno.env.get('PENDLE_CRON_API_KEY');

  if (!expectedKey) {
    console.log('PENDLE_CRON_API_KEY not configured - allowing access');
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

  // Verify access for cron job or frontend
  if (!verifyAccess(req)) {
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
    const allMarkets: (PendleMarket & { chainId: number; chainName: string })[] = [];
    const alerts: {
      pool_id: string;
      alert_type: string;
      previous_value: number;
      current_value: number;
      change_percent: number;
      pool_name: string;
      chain_name: string;
      chain_id: number;
      market_address: string;
      underlying_symbol: string;
      underlying_apy: number;
    }[] = [];

    // Fetch markets from all chains
    for (const chain of SUPPORTED_CHAINS) {
      try {
        console.log(`Fetching markets for ${chain.name} (chainId: ${chain.chainId})...`);

        let skip = 0;
        const limit = 100;
        let hasMore = true;

        while (hasMore) {
          const response = await fetch(
            `https://api-v2.pendle.finance/core/v1/${chain.chainId}/markets?order_by=name%3A1&skip=${skip}&limit=${limit}`,
            {
              headers: { 'Accept': 'application/json' }
            }
          );

          if (!response.ok) {
            console.error(`Failed to fetch ${chain.name} (skip: ${skip}): ${response.status}`);
            break;
          }

          const data = await response.json();
          const markets = data.results || data || [];

          if (markets.length === 0) {
            hasMore = false;
            break;
          }

          for (const market of markets) {
            allMarkets.push({
              chainId: chain.chainId,
              chainName: chain.name,
              ...market
            });
          }

          if (markets.length < limit) {
            hasMore = false;
          } else {
            skip += limit;
          }
        }
        
        console.log(`Finished fetching ${chain.name}, got total markets.`);
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
            updated_at: new Date().toISOString(),
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

        // Алерт о новом рынке — пул появился впервые
        if (!prevRate) {
          alerts.push({
            pool_id: poolId,
            alert_type: 'new_market',
            previous_value: 0,
            current_value: impliedApy,
            change_percent: 0,
            pool_name: market.name,
            chain_name: market.chainName,
            chain_id: market.chainId,
            market_address: market.address,
            underlying_symbol: market.underlyingAsset?.symbol || '?',
            underlying_apy: underlyingApy
          });
        }

        // Проверка изменений APY
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
                chain_id: market.chainId,
                market_address: market.address,
                underlying_symbol: market.underlyingAsset?.symbol || '?',
                underlying_apy: underlyingApy
              });
            }
          }

          // Check underlying APY spike
          if (prevUnderlying > 0) {
            const underlyingChange = (underlyingApy - prevUnderlying) / prevUnderlying;
            if (Math.abs(underlyingChange) >= ALERT_THRESHOLD) {
              alerts.push({
                pool_id: poolId,
                alert_type: 'underlying_spike',
                previous_value: prevUnderlying,
                current_value: underlyingApy,
                change_percent: underlyingChange * 100, // Keep sign for direction
                pool_name: market.name,
                chain_name: market.chainName,
                chain_id: market.chainId,
                market_address: market.address,
                underlying_symbol: market.underlyingAsset?.symbol || '?',
                underlying_apy: underlyingApy
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
              chain_id: market.chainId,
              market_address: market.address,
              underlying_symbol: market.underlyingAsset?.symbol || '?',
              underlying_apy: underlyingApy
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
          platform: 'Pendle',
          pool_name: alert.pool_name,
        });
    }

    // Send Telegram notifications
    if (alerts.length > 0) {
      const { data: users } = await supabase
        .from('user_telegram_settings')
        .select('*')
        .eq('is_active', true);
        
      if (users && users.length > 0) {
        for (const user of users) {
          // Check if platform is enabled for this user
          if (user.platforms && !user.platforms.includes('Pendle')) continue;
          
          let message = `🚨 <b>YieldMonitor: Изменения на Pendle</b>\n\n`;
          let hasAlertToSend = false;

          for (const alert of alerts) {
             const prev = (alert.previous_value * 100).toFixed(2);
             const curr = (alert.current_value * 100).toFixed(2);
             const chainSlug = CHAIN_SLUGS[alert.chain_id] || 'ethereum';
             const url = `https://app.pendle.finance/trade/markets/${alert.market_address}?chain=${chainSlug}`;
             const linkName = `<a href="${url}">${alert.underlying_symbol}</a>`;
             const marketName = alert.pool_name.replace('PT ', '');

             if (alert.alert_type === 'implied_spike' && Math.abs(alert.change_percent) >= Number(user.implied_apy_threshold_percent)) {
                 const currValue = (alert.current_value * 100).toFixed(2);
                 const underlyingValue = (alert.underlying_apy * 100).toFixed(2);
                 
                 const isIncrease = alert.change_percent > 0;
                 const notifyImpliedIncrease = user.notify_implied_increase !== false; // true по умолчанию
                 
                 if (isIncrease && !notifyImpliedIncrease) {
                     // Пользователь отключил уведомления о росте Implied APY
                     continue;
                 }
                 
                 message += `🔸 <b>${linkName}</b> (${marketName} @ ${alert.chain_name})\n`;
                 message += `Implied APY: ${prev}% ➡️ ${currValue}%\n`;
                 message += `Underlying APY: ${underlyingValue}%\n\n`;
                 hasAlertToSend = true;
             } else if (alert.alert_type === 'underlying_spike' && Math.abs(alert.change_percent) >= Number(user.underlying_apy_threshold_percent)) {
                 message += `🔹 <b>${linkName}</b> (${alert.chain_name})\nUnderlying APY: ${prev}% ➡️ ${curr}%\n\n`;
                 hasAlertToSend = true;
             } else if (alert.alert_type === 'yield_divergence') {
                 message += `⚠️ <b>Разрыв доходности: ${linkName}</b> (${alert.chain_name})\nUnderlying (${curr}%) сильно превышает Implied (${prev}%)\n\n`;
             } else if (alert.alert_type === 'new_market') {
                 message += `💠 <b>Новый пул на Pendle:</b>\n${linkName} (${alert.chain_name})\nНачальный Implied APY: ${curr}%\n\n`;
                 hasAlertToSend = true;
             }
          }

          if (hasAlertToSend && user.telegram_chat_id) {
             await notifyTelegram(user.telegram_chat_id, message);
          }
        }
      }
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
    // Log detailed error server-side only
    console.error('Error in fetch-pendle-markets:', error);
    // Return generic error message to client
    return new Response(JSON.stringify({ error: 'An error occurred processing your request' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
