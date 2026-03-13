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
            const status = settings.is_active ? "✅ Включены" : "🛑 Приостановлены";
            await sendMessage(chatId, `📊 Ваша статистика:\n\nУстановочный профиль: <b>${settings.telegram_username}</b>\nУведомления: ${status}\nПорог Implied APY: <b>${settings.implied_apy_threshold_percent}%</b>\nПлатформы: ${settings.platforms?.join(', ')}`);
         } else {
            await sendMessage(chatId, "Ваш аккаунт не привязан к YieldMonitor.");
         }
      } else {
         await sendMessage(chatId, "Я понимаю только команды /start, /stop и /status.");
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
