import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendMessage(chatId: number | string, text: string) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  console.log(`[Telegram] Sending message to ${chatId}...`);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      console.error(`[Telegram] Error sending message:`, result);
    } else {
      console.log(`[Telegram] Message sent successfully to ${chatId}`);
    }
    return result;
  } catch (error) {
    console.error(`[Telegram] Network error while sending message:`, error);
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const requestUrl = new URL(req.url);
    console.log(`[Webhook] Received ${req.method} request to ${requestUrl.pathname}`);

    const update = await req.json();
    console.log(`[Webhook] Update payload:`, JSON.stringify(update));

    if (!TELEGRAM_BOT_TOKEN) {
      console.error('[Webhook] TELEGRAM_BOT_TOKEN is missing!');
      return new Response(JSON.stringify({ error: 'Token missing' }), { status: 500 });
    }

    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();
      const username = update.message.from?.username || update.message.from?.first_name || 'User';

      console.log(`[Webhook] Processing command "${text}" from user ${username} (${chatId})`);

      if (text.startsWith('/start')) {
        const parts = text.split(' ');
        
        if (parts.length > 1) {
          const connectionCode = parts[1];
          console.log(`[Webhook] Connection attempt with code ${connectionCode}`);
          
          const { data: existing, error } = await supabase
            .from('user_telegram_settings')
            .select('*')
            .eq('connection_code', connectionCode)
            .single();

          if (error || !existing) {
            await sendMessage(chatId, "❌ Неверный или устаревший код подключения. Попробуйте сгенерировать новый на сайте YieldMonitor.");
          } else {
            if (existing.telegram_chat_id && existing.telegram_chat_id !== chatId) {
                 await sendMessage(chatId, "⚠️ Этот код уже был использован.");
            } else {
                 const { error: updateError } = await supabase
                   .from('user_telegram_settings')
                   .update({
                     telegram_chat_id: chatId,
                     telegram_username: username,
                     is_active: true
                   })
                   .eq('connection_code', connectionCode);

                 if (updateError) {
                   await sendMessage(chatId, "❌ Ошибка при привязке в БД. Попробуйте позже.");
                 } else {
                   await sendMessage(chatId, `✅ <b>Успешно!</b> Аккаунт @${username} привязан.\n\nТеперь вы будете получать уведомления.`);
                 }
            }
          }
        } else {
          const { data: alreadyLinked } = await supabase
            .from('user_telegram_settings')
            .select('*')
            .eq('telegram_chat_id', chatId)
            .single();
            
          if (alreadyLinked) {
            await sendMessage(chatId, `👋 С возвращением, ${username}!\nВаш аккаунт уже привязан к YieldMonitor.`);
          } else {
             await sendMessage(chatId, "Привет! Я бот YieldMonitor 📊\nДля получения уведомлений сгенерируйте код в настройках на сайте.");
          }
        }
      } else if (text === '/stop') {
         console.log(`[Webhook] Stop notifications for ${chatId}`);
         const { error } = await supabase
           .from('user_telegram_settings')
           .update({ is_active: false })
           .eq('telegram_chat_id', chatId);
            
         if (error) {
           await sendMessage(chatId, "❌ Ошибка при изменении настроек.");
         } else {
           await sendMessage(chatId, "🛑 Уведомления приостановлены.");
         }
      } else if (text === '/status') {
          console.log(`[Webhook] Status request for ${chatId}`);
          const { data: settings } = await supabase
             .from('user_telegram_settings')
             .select('*')
             .eq('telegram_chat_id', chatId)
             .single();
             
          if (settings) {
             const status = settings.is_active ? "🔔 <b>Активны</b>" : "🛑 <b>Приостановлены</b>";
             const platforms = settings.platforms && settings.platforms.length > 0 ? settings.platforms.join(', ') : "Все";
             const interval = settings.notification_interval_minutes ?? 60;
             const intervalLabel = interval < 60 ? `${interval} мин` : interval === 60 ? '1 час' : interval === 190 ? '190 мин' : interval === 360 ? '6 часов' : `${interval} мин`;
             
             await sendMessage(chatId, `📊 <b>Ваш профиль YieldMonitor</b>\n\n` +
               `👤 Юзер: <code>${username}</code>\n` +
               `Уведомления: ${status}\n\n` +
               `⚙️ <b>Настройки:</b>\n` +
               `▫️ Порог Implied: <b>${settings.implied_apy_threshold_percent}%</b>\n` +
               `▫️ Платформы: <code>${platforms}</code>\n` +
               `▫️ Интервал: <b>${intervalLabel}</b>\n\n` +
               `Используйте /help для списка всех команд.`);
          } else {
             await sendMessage(chatId, "⚠️ Ваш аккаунт не привязан к YieldMonitor.");
          }
      } else if (text === '/help') {
          console.log(`[Webhook] Help request for ${chatId}`);
          await sendMessage(chatId, `📖 <b>Доступные команды:</b>\n\n` +
            `/status - Настройки и состояние\n` +
            `/update - Принудительное обновление\n` +
            `/interval - Настроить интервал уведомлений\n` +
            `/stop - Приостановить уведомления\n` +
            `/start - Привязать аккаунт (нужен код)`);
      } else if (text === '/interval' || text.startsWith('/interval ')) {
          console.log(`[Webhook] Interval command from ${chatId}`);
          const { data: user } = await supabase
            .from('user_telegram_settings')
            .select('*')
            .eq('telegram_chat_id', chatId)
            .single();

          if (!user) {
            await sendMessage(chatId, "❌ Сначала привяжите аккаунт через /start.");
          } else {
            const parts = text.split(' ');
            if (parts.length > 1) {
              // e.g. /interval 190
              const minutes = parseInt(parts[1], 10);
              if (isNaN(minutes) || minutes < 10) {
                await sendMessage(chatId, "❌ Минимальный интервал — 10 минут. Пример: <code>/interval 60</code>");
              } else {
                const { error } = await supabase
                  .from('user_telegram_settings')
                  .update({ notification_interval_minutes: minutes })
                  .eq('telegram_chat_id', chatId);

                if (error) {
                  await sendMessage(chatId, "❌ Ошибка при сохранении.");
                } else {
                  const label = minutes < 60 ? `${minutes} мин` : minutes === 60 ? '1 час' : minutes === 360 ? '6 часов' : `${minutes} мин`;
                  await sendMessage(chatId, `✅ Интервал уведомлений установлен: <b>${label}</b>.`);
                }
              }
            } else {
              // Show presets
              const current = user.notification_interval_minutes ?? 60;
              const currentLabel = current < 60 ? `${current} мин` : current === 60 ? '1 час' : current === 190 ? '190 мин' : current === 360 ? '6 часов' : `${current} мин`;
              await sendMessage(chatId,
                `⏱ <b>Интервал уведомлений</b>\n` +
                `Текущий: <b>${currentLabel}</b>\n\n` +
                `Выберите или напишите команду с нужным числом минут:\n` +
                `• /interval 10  — каждые 10 мин\n` +
                `• /interval 60  — каждый час\n` +
                `• /interval 190 — каждые 190 мин\n` +
                `• /interval 360 — каждые 6 часов\n\n` +
                `<i>Минимум: 10 минут.</i>`);
            }
          }
      } else if (text === '/update') {
          console.log(`[Webhook] Update trigger for ${chatId}`);
          const { data: user } = await supabase
            .from('user_telegram_settings')
            .select('*')
            .eq('telegram_chat_id', chatId)
            .single();

          if (!user) {
            await sendMessage(chatId, "❌ Сначала привяжите аккаунт через /start.");
          } else {
            const statusStr = user.is_active ? "🔔 Уведомления включены" : "🛑 Уведомления выключены";
            await sendMessage(chatId, `🔄 <b>Запускаю обновление данных...</b>\n<i>${statusStr}</i>\n\nЭто может занять до 1 минуты.`);
            
            try {
              const functions = [
                'fetch-pendle-markets',
                'fetch-spectra-markets',
                'fetch-exponent-markets',
                'fetch-ratex-markets'
              ];

              const results = await Promise.all(functions.map(async (fn) => {
                console.log(`[Webhook] Triggering ${fn}...`);
                const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'Content-Type': 'application/json'
                  }
                });
                console.log(`[Webhook] ${fn} response: ${res.status} ${res.statusText}`);
                return { name: fn, ok: res.ok };
              }));

              const failed = results.filter(r => !r.ok).map(r => r.name);
              if (failed.length > 0) {
                await sendMessage(chatId, `⚠️ Обновление завершено с ошибками в ${failed.length} модулях. Но основные данные были успешно обработаны.`);
              } else {
                await sendMessage(chatId, "✅ <b>Обновление успешно завершено!</b>\nВсе платформы синхронизированы.");
              }
            } catch (e) {
              console.error('[Webhook] Update trigger error:', e);
              await sendMessage(chatId, "❌ Произошла ошибка при запуске обновления.");
            }
          }
      } else {
          console.log(`[Webhook] Unknown command "${text}" from ${chatId}`);
          await sendMessage(chatId, `❓ <b>Неизвестная команда.</b>\n\nДля списка команд введите /help.`);
      }
    } else {
      console.log(`[Webhook] No message or text in update`);
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error(`[Webhook] Critical error:`, err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
