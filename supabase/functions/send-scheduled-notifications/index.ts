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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('[Scheduler] Starting periodic notification run...');

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

      // Fetch recent alerts for this user (platforms filter)
      const platforms: string[] = user.platforms ?? ['Pendle', 'Spectra', 'Exponent', 'RateX'];

      let recentAlertsQuery = supabase
        .from('pendle_alerts')
        .select('pool_name, alert_type, change_percent, current_value, created_at')
        .in('platform', platforms)
        .eq('status', 'new')
        .order('created_at', { ascending: false })
        .limit(5);

      if (lastNotified) {
        recentAlertsQuery = recentAlertsQuery.gt('created_at', lastNotified.toISOString());
      }

      const { data: recentAlerts } = await recentAlertsQuery;

      // Fetch top pools summary
      const { data: topPools } = await supabase
        .from('pendle_pools')
        .select('name, implied_apy, underlying_apy, platform')
        .in('platform', platforms)
        .order('implied_apy', { ascending: false })
        .limit(5);

      // Build notification text
      const intervalLabel = formatInterval(user.notification_interval_minutes ?? 60);
      let text = `📊 <b>YieldMonitor — плановое обновление</b>\n`;
      text += `<i>Интервал: каждые ${intervalLabel}</i>\n\n`;

      if (recentAlerts && recentAlerts.length > 0) {
        text += `🔔 <b>Актуальные алерты:</b>\n`;
        for (const alert of recentAlerts) {
          const sign = alert.change_percent >= 0 ? '▲' : '▼';
          const pct = Math.abs(Number(alert.change_percent)).toFixed(2);
          const apy = (Number(alert.current_value) * 100).toFixed(2);
          text += `${sign} ${alert.pool_name}: <b>${apy}%</b> (${sign}${pct}%)\n`;
        }
        text += '\n';
      } else {
        text += `✅ <b>Алертов нет</b> — рынок стабилен.\n\n`;
      }

      if (topPools && topPools.length > 0) {
        text += `🏆 <b>Топ пулы по Implied APY:</b>\n`;
        for (const pool of topPools) {
          const implied = (Number(pool.implied_apy) * 100).toFixed(2);
          text += `• ${pool.name}: <b>${implied}%</b>\n`;
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
