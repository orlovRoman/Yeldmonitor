import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function sendMessage(chatId: number | string, text: string) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  return response.json();
}

function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  if (minutes === 60) return '1 час';
  if (minutes < 360) return `${minutes} мин`;
  if (minutes === 360) return '6 часов';
  return `${Math.round(minutes / 60)} ч`;
}

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum', 42161: 'Arbitrum', 56: 'BNB Chain', 10: 'Optimism',
  5000: 'Mantle', 8453: 'Base', 146: 'Sonic', 999: 'Hyperliquid',
  21000000: 'Corn', 80094: 'Berachain', 0: 'Solana'
};

// Check if a column exists in a table by trying to select it
async function columnExists(table: string, column: string): Promise<boolean> {
  const { error } = await supabase.from(table).select(column).limit(1);
  return !error;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('[Scheduler] Starting periodic notification run...');

    // Detect if platform column exists (migration might not be applied yet)
    const alertsHasPlatform = await columnExists('pendle_alerts', 'platform');
    const poolsHasPlatform = await columnExists('pendle_pools', 'platform');
    console.log(`[Scheduler] Schema: alerts.platform=${alertsHasPlatform}, pools.platform=${poolsHasPlatform}`);

    // Fetch active users who have a connected Telegram and whose interval has elapsed
    const { data: users, error } = await supabase
      .from('user_telegram_settings')
      .select('*')
      .eq('is_active', true)
      .not('telegram_chat_id', 'is', null);

    if (error) {
      console.error('[Scheduler] Error fetching users:', error);
      throw error;
    }

    if (!users || users.length === 0) {
      console.log('[Scheduler] No active users found.');
      return new Response(JSON.stringify({ ok: true, notified: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date();
    let notified = 0;

    for (const user of users) {
      const intervalMs = (user.notification_interval_minutes ?? 60) * 60 * 1000;
      const lastNotified = user.last_notified_at ? new Date(user.last_notified_at) : null;

      // Skip if not enough time has passed since last notification
      if (lastNotified && now.getTime() - lastNotified.getTime() < intervalMs) {
        console.log(`[Scheduler] Skipping user ${user.telegram_chat_id} — interval not elapsed.`);
        continue;
      }

      const platforms: string[] = user.platforms ?? ['Pendle', 'Spectra', 'Exponent', 'RateX'];

      // Fetch recent alerts — handle missing platform column gracefully
      let recentAlerts: any[] = [];
      try {
        let alertsQuery = supabase
          .from('pendle_alerts')
          .select('pool_id, pool_name, alert_type, change_percent, current_value, previous_value, platform, created_at, pendle_pools(chain_id, expiry, underlying_asset, name)')
          .eq('status', 'new')
          .order('created_at', { ascending: false })
          .limit(5);

        if (lastNotified) {
          alertsQuery = alertsQuery.gt('created_at', lastNotified.toISOString());
        }

        // Only filter by platform if column exists
        if (alertsHasPlatform) {
          alertsQuery = alertsQuery.in('platform', platforms);
        }

        const { data: alertsData, error: alertsError } = await alertsQuery;
        if (!alertsError && alertsData) {
          recentAlerts = alertsData;
          
          // Fetch underlying_apy for these pools
          const poolIds = recentAlerts.map(a => a.pool_id).filter(id => id);
          if (poolIds.length > 0) {
             const { data: rates } = await supabase
               .from('pendle_rates_history')
               .select('pool_id, underlying_apy')
               .in('pool_id', poolIds)
               .order('recorded_at', { ascending: false });
               
             const rateMap = new Map();
             if (rates) {
                 for (const r of rates) {
                     if (!rateMap.has(r.pool_id)) rateMap.set(r.pool_id, r);
                 }
             }
             for (const a of recentAlerts) {
                 if (a.pool_id && rateMap.has(a.pool_id)) {
                     a.underlying_apy = rateMap.get(a.pool_id).underlying_apy;
                 }
             }
          }
        }
        else if (alertsError) console.warn('[Scheduler] alerts query error:', alertsError.message);
      } catch (e) {
        console.warn('[Scheduler] alerts fetch failed:', e);
      }

      // Fetch top pools — join with pendle_rates_history for live APY
      let topPools: any[] = [];
      try {
        // Get pools with latest rate from history
        const { data: pools } = await supabase
          .from('pendle_pools')
          .select(`id, name, chain_id, expiry, underlying_asset, ${poolsHasPlatform ? 'platform,' : ''} pendle_rates_history!inner(implied_apy, recorded_at)`)
          .order('pendle_rates_history.recorded_at', { ascending: false })
          .limit(20);

        if (pools) {
          // Deduplicate by pool id and sort by implied_apy
          const seen = new Set<string>();
          for (const p of pools) {
            if (seen.has(p.id)) continue;
            seen.add(p.id);
            const pl = p.platform || (
              p.name?.includes('[Spectra]') ? 'Spectra' :
              p.name?.includes('[RateX]') ? 'RateX' :
              p.name?.includes('[Exponent]') ? 'Exponent' : 'Pendle'
            );
            const hist = Array.isArray(p.pendle_rates_history) ? p.pendle_rates_history[0] : (p.pendle_rates_history as any);
            if (platforms.includes(pl) && hist?.implied_apy > 0) {
              topPools.push({ 
                name: p.name, 
                platform: pl, 
                implied_apy: hist.implied_apy,
                chain_id: p.chain_id,
                expiry: p.expiry,
                underlying_asset: p.underlying_asset
              });
            }
          }
          topPools.sort((a, b) => b.implied_apy - a.implied_apy);
          topPools = topPools.slice(0, 5);
        }
      } catch (e) {
        console.warn('[Scheduler] top pools fetch failed:', e);
      }

      // Build notification text
      const intervalLabel = formatInterval(user.notification_interval_minutes ?? 60);
      let text = `📊 <b>YieldMonitor — плановое обновление</b>\n`;
      text += `<i>Интервал: каждые ${intervalLabel}</i>\n\n`;

      if (recentAlerts.length > 0) {
        text += `🔔 <b>Актуальные алерты:</b>\n`;
        for (const alert of recentAlerts) {
          const sign = alert.change_percent >= 0 ? '▲' : '▼';
          const apy = (Number(alert.current_value) * 100).toFixed(2);
          const prevApy = (Number(alert.previous_value || 0) * 100).toFixed(2);
          
          let metricStr = '';
          if (alert.alert_type === 'implied_spike') metricStr = 'Implied APY';
          else if (alert.alert_type === 'underlying_spike') metricStr = 'Underlying APY';
          else if (alert.alert_type === 'yield_divergence') metricStr = 'Разрыв APY';
          else if (alert.alert_type === 'new_market') metricStr = 'Новый пул';
          else metricStr = 'APY';
          
          let platformClean = alert.platform || 'Yield';
          let chainName = alert.pendle_pools?.chain_id ? (CHAIN_NAMES[alert.pendle_pools.chain_id] || '') : (platformClean === 'RateX' ? 'Solana' : '');
          let platformStr = chainName ? `[${platformClean} | ${chainName}]` : `[${platformClean}]`;
          
          let assetName = alert.pendle_pools?.underlying_asset || alert.pendle_pools?.name || alert.pool_name || '';
          assetName = assetName.replace(/\[.*?\]\s*/g, '').replace(/^PT\s+/i, '');
          if (assetName === 'PENDLE-LPT' || assetName.toLowerCase() === 'unknown' || assetName === 'Pool' || assetName === '') {
             assetName = alert.pendle_pools?.name ? alert.pendle_pools.name.replace(/\[.*?\]\s*/g, '').replace(/^PT\s+/i, '') : 'Pool';
             // If still bad, fallback
             if (assetName === 'PENDLE-LPT' || assetName.toLowerCase() === 'unknown') assetName = `Asset ${alert.pool_name?.substring(0,4) || ''}`;
          }
          
          let expiryStr = '';
          if (alert.pendle_pools?.expiry) {
            const expDate = new Date(alert.pendle_pools.expiry);
            expiryStr = ` (до ${expDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })})`;
          }
          
          let underlyingInfo = '';
          if (alert.alert_type === 'implied_spike' && alert.underlying_apy !== undefined) {
             const under = (Number(alert.underlying_apy) * 100).toFixed(2);
             underlyingInfo = ` | Und: ${under}%`;
          }
          
          const changeStr = alert.alert_type === 'new_market' ? `(создан)` : `(было ${prevApy}%)`;

          text += `${sign} ${platformStr} <b>${assetName}</b>${expiryStr}: <b>${metricStr} ${apy}%</b> ${changeStr}${underlyingInfo}\n`;
        }
        text += '\n';
      } else {
        text += `✅ <b>Алертов нет</b> — рынок стабилен.\n\n`;
      }

      if (topPools.length > 0) {
        text += `🏆 <b>Топ пулы по Implied APY:</b>\n`;
        for (const pool of topPools) {
          const implied = (Number(pool.implied_apy) * 100).toFixed(2);
          let platformClean = pool.platform || 'Yield';
          let chainName = pool.chain_id ? (CHAIN_NAMES[pool.chain_id] || '') : (platformClean === 'RateX' ? 'Solana' : '');
          let platformStr = chainName ? `[${platformClean} | ${chainName}]` : `[${platformClean}]`;
          
          let assetName = pool.underlying_asset || pool.name || '';
          assetName = assetName.replace(/\[.*?\]\s*/g, '').replace(/^PT\s+/i, '');
          if (assetName === 'PENDLE-LPT' || assetName.toLowerCase() === 'unknown') assetName = pool.name.replace(/\[.*?\]\s*/g, '').replace(/^PT\s+/i, '');
          
          let expiryStr = '';
          if (pool.expiry) {
            const expDate = new Date(pool.expiry);
            expiryStr = ` (до ${expDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })})`;
          }

          text += `• ${platformStr} <b>${assetName}</b>${expiryStr}: <b>${implied}%</b>\n`;
        }
      }

      text += `\n<i>Используй /update чтобы принудительно обновить данные.</i>`;

      try {
        await sendMessage(user.telegram_chat_id, text);
        console.log(`[Scheduler] Notified user ${user.telegram_chat_id}`);

        // Update last_notified_at
        await supabase
          .from('user_telegram_settings')
          .update({ last_notified_at: now.toISOString() })
          .eq('id', user.id);

        notified++;
      } catch (e) {
        console.error(`[Scheduler] Failed to notify ${user.telegram_chat_id}:`, e);
      }
    }

    console.log(`[Scheduler] Done. Notified ${notified}/${users.length} users.`);
    return new Response(JSON.stringify({ ok: true, notified, total: users.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[Scheduler] Critical error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
