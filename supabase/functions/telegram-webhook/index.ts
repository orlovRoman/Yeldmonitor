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
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url);
    // Для безопасности можно добавить secret_token в параметры вебхука (мы сделаем это позже)

    const update = await req.json();

    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();
      const username = update.message.from?.username || update.message.from?.first_name || 'User';

      if (text.startsWith('/start')) {
        const parts = text.split(' ');
        
        if (parts.length > 1) {
          const connectionCode = parts[1];
          console.log(`User ${username} trying to connect with code ${connectionCode}`);
          
          // Check if code exists
          const { data: existing, error } = await supabase
            .from('user_telegram_settings')
            .select('*')
            .eq('connection_code', connectionCode)
            .single();

          if (error || !existing) {
            await sendMessage(chatId, "❌ Неверный или устаревший код подключения. Попробуйте сгенерировать новый на сайте YieldMonitor.");
          } else {
            // Check if already connected by someone else
            if (existing.telegram_chat_id && existing.telegram_chat_id !== chatId) {
                 await sendMessage(chatId, "⚠️ Этот код уже был использован.");
            } else {
                 // Link account
                 const { error: updateError } = await supabase
                   .from('user_telegram_settings')
                   .update({
                     telegram_chat_id: chatId,
                     telegram_username: username,
                     is_active: true
                   })
                   .eq('connection_code', connectionCode);

                 if (updateError) {
                   await sendMessage(chatId, "❌ Ошибка при привязке. Попробуйте позже.");
                 } else {
                   await sendMessage(chatId, `✅ <b>Успешно!</b> Аккаунт @${username} привязан к YieldMonitor.\n\nТеперь вы будете получать уведомления о резких изменениях APY.`);
                 }
            }
          }
        } else {
          // Check if already linked
          const { data: alreadyLinked } = await supabase
            .from('user_telegram_settings')
            .select('*')
            .eq('telegram_chat_id', chatId)
            .single();
            
          if (alreadyLinked) {
            await sendMessage(chatId, `👋 С возвращением, ${username}!\nВаш аккаунт уже привязан к YieldMonitor. Вы получаете уведомления.\n\nОтправить /stop, чтобы приостановить уведомления.`);
          } else {
             await sendMessage(chatId, "Привет! Я бот YieldMonitor 📊\n\nЧтобы получать уведомления об APY, перейдите на сайт YieldMonitor, сгенерируйте код в настройках и нажмите на ссылку.");
          }
        }
      } else if (text === '/stop') {
         const { error } = await supabase
           .from('user_telegram_settings')
           .update({ is_active: false })
           .eq('telegram_chat_id', chatId);
           
         if (error) {
           await sendMessage(chatId, "❌ Произошла ошибка.");
         } else {
           await sendMessage(chatId, "🛑 Уведомления приостановлены. Отправьте любой /start код с сайта, чтобы возобновить.");
         }
      } else if (text === '/status') {
          const { data: settings } = await supabase
             .from('user_telegram_settings')
             .select('*')
             .eq('telegram_chat_id', chatId)
             .single();
             
          if (settings) {
             const status = settings.is_active ? "🔔 <b>Активны</b>" : "🛑 <b>Приостановлены</b>";
             const platforms = settings.platforms && settings.platforms.length > 0 ? settings.platforms.join(', ') : "Все";
             
             await sendMessage(chatId, `📊 <b>Ваш профиль YieldMonitor</b>\n\n` +
               `👤 Юзер: <code>${username}</code>\n` +
               `Уведомления: ${status}\n\n` +
               `⚙️ <b>Настройки:</b>\n` +
               `▫️ Порог Implied: <b>${settings.implied_apy_threshold_percent}%</b>\n` +
               `▫️ Платформы: <code>${platforms}</code>\n\n` +
               `Введите /help для списка всех команд.`);
          } else {
             await sendMessage(chatId, "⚠️ Ваш аккаунт не привязан к YieldMonitor.\nИспользуйте команду /start с кодом из личного кабинета.");
          }
      } else if (text === '/help') {
          await sendMessage(chatId, `📖 <b>Доступные команды:</b>\n\n` +
            `/status - Показать текущие настройки и состояние\n` +
            `/update - Принудительно обновить данные прямо сейчас\n` +
            `/stop - Приостановить получение уведомлений\n` +
            `/start - Привязать аккаунт (нужен код)\n\n` +
            `<i>Бот автоматически присылает уведомления при резких скачках доходности.</i>`);
      } else if (text === '/update') {
          // Check if user is linked
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

              // Trigger all updates in parallel
              const results = await Promise.all(functions.map(async (fn) => {
                const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'Content-Type': 'application/json'
                  }
                });
                return { name: fn, ok: res.ok };
              }));

              const failed = results.filter(r => !r.ok).map(r => r.name);
              if (failed.length > 0) {
                console.error('Some updates failed:', failed);
                await sendMessage(chatId, `⚠️ Обновление завершено с ошибками в ${failed.length} модулях. Но основные данные были успешно обработаны.`);
              } else {
                await sendMessage(chatId, "✅ <b>Обновление успешно завершено!</b>\nВсе платформы синхронизированы.");
              }
            } catch (e) {
              console.error('Update trigger error:', e);
              await sendMessage(chatId, "❌ Произошла ошибка при запуске обновления.");
            }
          }
      } else {
          await sendMessage(chatId, `❓ <b>Неизвестная команда.</b>\n\nЯ понимаю основные команды управления. Введите /help, чтобы увидеть список всех команд.`);
      }
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
