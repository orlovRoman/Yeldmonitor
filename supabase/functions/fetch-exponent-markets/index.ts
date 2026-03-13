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

// Alert thresholds
const IMPLIED_APY_THRESHOLD = 0.01; // 1% change threshold for implied APY

// Exponent Finance is Solana-only
const SOLANA_CHAIN_ID = 501; // Custom chain ID for Solana (Exponent)

// Verify API key for scheduled job access
function verifyAccess(req: Request): boolean {
  const authHeader = req.headers.get('Authorization');
  const expectedKey = Deno.env.get('EXPONENT_CRON_API_KEY');

  if (!expectedKey) {
    console.log('EXPONENT_CRON_API_KEY not configured - allowing access');
    return true;
  }

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const providedKey = authHeader.replace('Bearer ', '');
    if (providedKey === expectedKey) return true;
  }

  return req.headers.has('x-client-info') || req.headers.has('apikey');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!verifyAccess(req)) {
    console.error('Unauthorized access attempt to fetch-exponent-markets');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting Exponent Finance markets fetch via direct API...');
    const alerts: any[] = [];
    const pools = [];
    let inserted = 0;

    // Fetch vaults (markets)
    const vaultsRes = await fetch('https://api.exponent.finance/api/vaults', {
      headers: { "Accept": "application/json" }
    });
    
    if (!vaultsRes.ok) {
        throw new Error(`Failed to fetch exponent vaults: ${vaultsRes.status}`);
    }

    const vaults = await vaultsRes.json();
    
    // Fetch tokens metadata from multiple sources for robustness
    let tokensDict: Record<string, any> = {
      // Hardcoded fallback for common Exponent tokens
      'tzqPfHkNpMDxvijpyZihXpjpQ9dzmgDVzgnUcfi3Ubv': { name: 'Maple Syrup USDC', ticker: 'MS-USDC' },
      'Fy7SiHCwMzNMXYgygQhpYvjSg23G8B9TfZm3mHNgy6Bu': { name: 'Bulk Staked SOL', ticker: 'BULKSOL' },
      'BULKoNSGzxtCqzwTvg5hFJg8fx6dqZRScyXe5LYMfxrn': { name: 'BULK Staked SOL', ticker: 'BulkSOL' },
      '6FrrzDk5mQARGc1TDYoyVnSyRdds1t4PbtohCD6p3tgG': { name: 'Solstice USX', ticker: 'USX' },
      'AbLVgZ12tDRf7PSYFKRjtHM1yvqXwhLk9sSiL8ocRqt3': { name: 'Hylo xSOL SY', ticker: 'xSOL' },
      'GhMVkhVquqvMyGixDKsWiXKGV771H34KWDfXTwigGBko': { name: 'Jupiter Lend USDG', ticker: 'JL-USDG' },
      'BehZJhD9RYuXZTUcfXD5vUP4BtJmjTVdZyLifHkcsp9H': { name: 'Ethena USDe', ticker: 'USDe' },
      'HT5Fr38iHyLHjuFFCBwQWHMiCBrL9rf5LzAUSxyLCpD2': { name: 'Ethena sUSDe', ticker: 'sUSDe' },
    };

    const apiSources = [
      'https://api.exponent.finance/api/tokens',
      'https://api-n408.onrender.com/api/tokens'
    ];

    for (const url of apiSources) {
      try {
        const res = await fetch(url, { headers: { "Accept": "application/json" } });
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list)) {
            for (const t of list) {
              if (t.mint) {
                // Merge, preferring official API properties if already present? 
                // Actually if it's already in Dict, keep it unless new one has more info
                const mint = t.mint.trim();
                tokensDict[mint] = {
                   ...tokensDict[mint],
                   ...t
                };
              }
            }
          }
        }
      } catch (e) {
        console.warn(`Failed to fetch tokens from ${url}:`, e);
      }
    }
    
    console.log(`Fetched ${vaults.length} vaults and built token dictionary with ${Object.keys(tokensDict).length} entries.`);

    for (const vault of vaults) {
      try {
        // Vault has pt_mint and sy_token which can be matched against tokensDict
        const syTokenMint = (vault.sy_token || vault.underlying_mint || '').trim();
        const ptMint = (vault.pt_mint || '').trim();
        
        // Find token names from the dictionary
        const syTokenMeta = tokensDict[syTokenMint];
        const ptTokenMeta = tokensDict[ptMint];
        
        // Fallback names if not found in dict
        let tokenName = syTokenMeta?.name || syTokenMeta?.ticker || syTokenMeta?.symbol ||
                        ptTokenMeta?.name || ptTokenMeta?.ticker || ptTokenMeta?.symbol || "Unknown";
        
        let ticker = syTokenMeta?.ticker || syTokenMeta?.symbol || 
                     ptTokenMeta?.ticker || ptTokenMeta?.symbol || "Token";
        
        let displayName = `${tokenName} (${ticker})`;
        
        if (tokenName === "Unknown" && vault.address) {
           displayName = `Vault ${vault.address.substring(0, 6)}...`;
        }

        const marketAddressRaw = ptMint || vault.address;
        if (!marketAddressRaw) {
          console.warn(`Skipping vault, no pt_mint or address:`, vault);
          continue;
        }
        const marketAddress = `exponent-${marketAddressRaw.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

        const expiryDate = vault.end_timestamp || null;
        
        pools.push({ 
           name: displayName,
           address: marketAddress
        });

        // Upsert pool into pending_pools table
        const { error: poolError } = await supabase
          .from('pendle_pools')
          .upsert({
            chain_id: SOLANA_CHAIN_ID,
            market_address: marketAddress,
            name: `[Exponent] ${displayName}`,
            underlying_asset: tokenName,
            pt_address: ptMint || vault.address,
            sy_address: syTokenMint,
            expiry: expiryDate,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'chain_id,market_address'
          });

        if (poolError) {
          console.error(`Error upserting Exponent pool ${displayName}:`, poolError);
          continue;
        }

        // Get the pool ID
        const { data: poolData } = await supabase
          .from('pendle_pools')
          .select('id')
          .eq('chain_id', SOLANA_CHAIN_ID)
          .eq('market_address', marketAddress)
          .single();

        if (poolData) {
          const poolId = poolData.id;
          
          // Exponent implied_apy is sometimes in vault.implied_apy or vault.markets[0].last_seen_ln_implied_apy
          let impliedApy = vault.implied_apy || 0;
          if (impliedApy === 0 && vault.markets && vault.markets.length > 0) {
             impliedApy = vault.markets[0].last_seen_ln_implied_apy || 0;
          }
          
          const underlyingApyEstimate = impliedApy * 0.7; // Exponent API doesn't always provide clear underlying APY
          
          // Try to get liquidity TVL
          let liquidity = vault.legacy_tvl_in_base_token || 0;
          if (liquidity === 0 && vault.pt_supply && syTokenMeta?.priceUsd) {
             liquidity = vault.pt_supply * syTokenMeta.priceUsd;
          } else if (liquidity === 0) {
             liquidity = 0; // Default if unparseable
          }

          // Get previous rate for comparison
          const { data: prevRate } = await supabase
            .from('pendle_rates_history')
            .select('implied_apy')
            .eq('pool_id', poolId)
            .order('recorded_at', { ascending: false })
            .limit(1)
            .single();

          // Insert rate history
          await supabase
            .from('pendle_rates_history')
            .insert({
              pool_id: poolId,
              implied_apy: impliedApy,
              underlying_apy: underlyingApyEstimate,
              liquidity: liquidity,
              volume_24h: 0,
            });

          // Алерт о новом рынке — пул появился впервые
          if (!prevRate) {
            alerts.push({
              pool_id: poolId,
              alert_type: 'new_market',
              previous_value: 0,
              current_value: impliedApy,
              change_percent: 0,
              pool_name: displayName,
            });
          }

          // Проверка изменений APY
          if (prevRate) {
            const prevImplied = Number(prevRate.implied_apy) || 0;

            if (prevImplied > 0) {
              const impliedChange = (impliedApy - prevImplied) / prevImplied;
              if (Math.abs(impliedChange) >= IMPLIED_APY_THRESHOLD) {
                alerts.push({
                  pool_id: poolId,
                  alert_type: 'implied_spike',
                  previous_value: prevImplied,
                  current_value: impliedApy,
                  change_percent: impliedChange * 100,
                  pool_name: displayName,
                });
              }
            }
          }
          inserted++;
        }
      } catch (error) {
        console.error(`Error processing Exponent vault ${vault.address}:`, error);
      }
    }

    console.log(`Generated ${alerts.length} alerts for Exponent pools`);

    // Insert alerts
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

    // Send Telegram notifications
    if (alerts.length > 0) {
      const { data: users } = await supabase
        .from('user_telegram_settings')
        .select('*')
        .eq('is_active', true);
        
      if (users && users.length > 0) {
        for (const user of users) {
          if (user.platforms && !user.platforms.includes('Exponent')) continue;
          
          let message = `🚨 <b>YieldMonitor: Изменения на Exponent</b>\n\n`;
          let hasAlertToSend = false;

          for (const alert of alerts) {
             const prev = (alert.previous_value * 100).toFixed(2);
             const curr = (alert.current_value * 100).toFixed(2);
             const change = alert.change_percent.toFixed(2);
             const sign = alert.change_percent > 0 ? "📈 Возрос" : "📉 Упал";
             const poolName = alert.pool_name || "Unknown Pool";

             if (alert.alert_type === 'implied_spike' && Math.abs(alert.change_percent) >= Number(user.implied_apy_threshold_percent)) {
                 message += `🔸 <b>${poolName}</b>\nImplied APY: ${prev}% ➡️ ${curr}%\nИзменение: ${sign} на ${change}%\n\n`;
                 hasAlertToSend = true;
             } else if (alert.alert_type === 'new_market') {
                 message += `💠 <b>Новый пул добавленный на Exponent:</b>\n${poolName}\nНачальный Implied APY: ${curr}%\n\n`;
                 hasAlertToSend = true;
             }
          }

          if (hasAlertToSend && user.telegram_chat_id) {
             await notifyTelegram(user.telegram_chat_id, message);
          }
        }
      }
    }

    console.log(`Successfully inserted/updated ${inserted} Exponent pools`);

    return new Response(JSON.stringify({
      success: true,
      pools_scraped: vaults.length,
      pools_inserted: inserted,
      alerts_generated: alerts.length,
      pools: pools.slice(0, 10),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in fetch-exponent-markets:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: 'An error occurred processing your request', message: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
