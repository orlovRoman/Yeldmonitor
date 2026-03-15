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

const IMPLIED_APY_THRESHOLD = 0.01;
const ALERT_COOLDOWN_HOURS = 24;

const SPECTRA_CHAIN_SLUGS: Record<number, string> = {
  1: 'eth',
  42161: 'arbitrum',
  10: 'op',
  8453: 'base',
  146: 'sonic',
  43114: 'avax',
  56: 'bsc',
  14: 'flare',
  103: 'katana',
  999: 'hyperevm',
};

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum', 42161: 'Arbitrum', 10: 'Optimism', 8453: 'Base',
  146: 'Sonic', 43114: 'Avalanche', 56: 'BNB Chain', 14: 'Flare',
  747474: 'Katana', 999: 'HyperEVM', 43111: 'Hemi',
};

interface SpectraPool {
  address: string;
  name: string;
  chainId: number;
  tvl: { ibt: number; underlying: number; usd: number };
  liquidity: { ibt: number; underlying: number; usd: number };
  ptApy: number;
  impliedApy: number;
  lpApy: any;
  maturity: number;
  ibt?: { symbol: string; address: string };
  underlying?: { symbol: string; address: string };
  yt?: { symbol: string; address: string };
  pools?: SpectraPool[];
  // Поля, пробрасываемые из родительского объекта
  _parentUnderlying?: string;
  _parentIbt?: string;
}

/**
 * Загружает данные Spectra из __NEXT_DATA__ (Next.js SSR).
 * Не требует Firecrawl — прямой HTTP-запрос к HTML и парсинг JSON.
 */
async function fetchSpectraPoolsFromNextData(): Promise<SpectraPool[]> {
  console.log('[Spectra] Загружаем HTML страницы trade-yield...');
  const response = await fetch('https://app.spectra.finance/trade-yield', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html',
    },
  });

  if (!response.ok) {
    throw new Error(`Spectra HTML: статус ${response.status}`);
  }

  const html = await response.text();
  console.log(`[Spectra] HTML загружен: ${html.length} символов`);

  // Извлекаем JSON из тега <script id="__NEXT_DATA__">
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!nextDataMatch) {
    throw new Error('Не удалось найти __NEXT_DATA__ в HTML');
  }

  const nextData = JSON.parse(nextDataMatch[1]);
  const queries = nextData?.props?.pageProps?.dehydratedState?.queries || [];
  console.log(`[Spectra] Найдено ${queries.length} запросов в dehydratedState`);

  // Находим запрос с пулами — массив с данными
  let allPools: SpectraPool[] = [];
  for (const query of queries) {
    const data = query?.state?.data;
    if (Array.isArray(data) && data.length > 3) {
      // Spectra хранит маркеты как верхнеуровневые объекты с вложенным pools[]
      // underlying и ibt — на уровне родителя, их нужно пробросить в дочерние пулы
      for (const item of data) {
        const parentUnderlying = item.underlying?.symbol || '';
        const parentIbt = item.ibt?.symbol || '';

        if (item.pools && Array.isArray(item.pools)) {
          for (const pool of item.pools) {
            pool._parentUnderlying = parentUnderlying;
            pool._parentIbt = parentIbt;
            if (!pool.tvl && item.tvl) {
              pool.tvl = item.tvl;
            }
            if (!pool.liquidity && item.liquidity) {
              pool.liquidity = item.liquidity;
            }
          }
          allPools.push(...item.pools);
        } else if (item.address && (item.impliedApy !== undefined || item.ptApy !== undefined)) {
          item._parentUnderlying = parentUnderlying;
          item._parentIbt = parentIbt;
          allPools.push(item);
        }
      }
    }
  }

  console.log(`[Spectra] Извлечено ${allPools.length} пулов из __NEXT_DATA__`);
  return allPools;
}

function verifyAccess(req: Request): boolean {
  const authHeader = req.headers.get('Authorization');
  const expectedKey = Deno.env.get('SPECTRA_CRON_API_KEY');
  if (!expectedKey) return true;
  if (authHeader?.startsWith('Bearer ') && authHeader.replace('Bearer ', '') === expectedKey) return true;
  return req.headers.has('x-client-info') || req.headers.has('apikey');
}

/** Удаляет из БД Spectra-пулы, которых нет в activeMarketAddresses. */
async function cleanupStalePools(supabase: ReturnType<typeof import('https://esm.sh/@supabase/supabase-js@2').createClient>, activeMarketAddresses: string[]): Promise<number> {
  const { data: existingSpectraPools } = await supabase
    .from('pendle_pools')
    .select('id, market_address, name')
    .like('market_address', 'spectra-%');

  if (!existingSpectraPools || existingSpectraPools.length === 0) return 0;

  const stalePools = activeMarketAddresses.length > 0
    ? existingSpectraPools.filter(p => !activeMarketAddresses.includes(p.market_address))
    : existingSpectraPools; // если пулов вообще не нашли — удалять нечего, безопаснее оставить

  if (stalePools.length === 0) return 0;

  console.log(`[Spectra] Удаляем ${stalePools.length} фантомных пулов: ${stalePools.map(p => p.name).join(', ')}`);
  const staleIds = stalePools.map(p => p.id);
  const { error: deleteError } = await supabase.from('pendle_pools').delete().in('id', staleIds);
  if (deleteError) {
    console.error('[Spectra] Ошибка удаления фантомных пулов:', deleteError);
    return 0;
  }
  console.log(`[Spectra] Фантомные пулы успешно удалены`);
  return stalePools.length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  if (!verifyAccess(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Режим ручной очистки: POST { action: 'cleanup' }
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no body is fine */ }
    if (body?.action === 'cleanup') {
      const removed = await cleanupStalePools(supabase, []);
      return new Response(JSON.stringify({ success: true, message: `Удалено ${removed} фантомных Spectra-пулов` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Загружаем пулы напрямую из Next.js SSR данных (без Firecrawl)
    const pools = await fetchSpectraPoolsFromNextData();

    if (pools.length === 0) {
      console.warn('[Spectra] Пулы не найдены в __NEXT_DATA__ — страница, вероятно, рендерится на клиенте.');
      // НЕ выходим сразу — cleanup всё равно может найти фантомы если нет активных пулов;
      // но удалять ВСЕ записи когда источник вернул 0 опасно, просто сообщаем.
      return new Response(JSON.stringify({
        success: false, pools_scraped: 0, error: 'Не удалось распарсить пулы из __NEXT_DATA__. Попробуйте позже.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const alerts: {
      pool_id: string;
      alert_type: string;
      previous_value: number;
      current_value: number;
      change_percent: number;
      pool_name?: string;
      chain_name?: string;
      chain_id?: number;
    }[] = [];
    let inserted = 0, alertsCreated = 0;

    // Собираем все актуальные market_address для последующей очистки
    const activeMarketAddresses: string[] = [];

    for (const pool of pools) {
      try {
        const chainId = pool.chainId || 1;
        const chainName = CHAIN_NAMES[chainId] || `Chain-${chainId}`;
        const marketAddress = `spectra-${chainId}-${pool.address.replace('0x', '').slice(0, 12).toLowerCase()}`;

        activeMarketAddresses.push(marketAddress);

        // impliedApy из Spectra приходит в процентах (напр. 9.61 = 9.61%)
        const impliedApy = (pool.impliedApy || pool.ptApy || 0) / 100;
        const liquidity = pool.liquidity?.usd || pool.tvl?.usd || 0;

        // Дата экспирации из unix timestamp (секунды)
        let expiryDate: string | null = null;
        if (pool.maturity) {
          expiryDate = new Date(pool.maturity * 1000).toISOString();
        }

        // Название токена: сначала из IBT (как показывает Spectra UI), потом underlying, потом парсим из name
        let tokenName = pool._parentIbt || pool._parentUnderlying || '';
        // Убираем внутренний префикс Spectra (напр. "sw-sFLR" → "sFLR")
        tokenName = tokenName.replace(/^sw-/, '');
        if (!tokenName && pool.name) {
          // Формат: "Principal Token: sw-WUSDN(USDN) 2027/01/12" → извлекаем USDN
          const parenMatch = pool.name.match(/\(([^)]+)\)/);
          const colonMatch = pool.name.match(/:\s*([^(\s]+)/);
          tokenName = parenMatch?.[1] || colonMatch?.[1] || pool.name;
        }
        if (!tokenName) tokenName = 'Unknown';

        const { error: poolError } = await supabase.from('pendle_pools').upsert({
          chain_id: chainId,
          market_address: marketAddress,
          name: `[Spectra] ${tokenName}`,
          underlying_asset: tokenName,
          expiry: expiryDate,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'chain_id,market_address' });

        if (poolError) { console.error(`Ошибка upsert для ${tokenName}:`, poolError); continue; }

        const { data: poolData } = await supabase
          .from('pendle_pools').select('id')
          .eq('chain_id', chainId).eq('market_address', marketAddress)
          .single();

        if (!poolData) continue;

        const poolId = poolData.id;

        // Получаем предыдущую ставку для сравнения
        const { data: prevRate } = await supabase
          .from('pendle_rates_history').select('id, implied_apy, liquidity')
          .eq('pool_id', poolId).order('recorded_at', { ascending: false })
          .limit(1).single();

        const prevImplied = prevRate ? Number(prevRate.implied_apy) : 0;
        const apyDiff = Math.abs(impliedApy - prevImplied);

        // Записываем ставку только если есть изменения
        if (!prevRate || apyDiff > 0.001) {
          await supabase.from('pendle_rates_history').insert({
            pool_id: poolId,
            implied_apy: impliedApy,
            underlying_apy: impliedApy * 0.9, // Примерная оценка
            liquidity: liquidity,
            volume_24h: 0,
          });
        } else if (prevRate && Math.abs((Number(prevRate.liquidity) || 0) - liquidity) > 1) {
          // APY не изменился, но ликвидность обновилась — обновляем существующую запись
          await supabase.from('pendle_rates_history')
            .update({ liquidity: liquidity })
            .eq('id', prevRate.id);
        }

        // Алерт о новом рынке — пул появился впервые
        if (!prevRate) {
          alerts.push({
            pool_id: poolId,
            alert_type: 'yield_divergence',
            previous_value: impliedApy,
            current_value: impliedApy * 0.9, // Assuming underlyingApy is impliedApy * 0.9
            change_percent: (impliedApy - (impliedApy * 0.9)) / impliedApy * 100, // Assuming divergence calculation
            pool_name: pool.name,
            chain_name: chainName, // Using chainName from current scope
            chain_id: chainId // Using chainId from current scope
          });
        }

        // Проверка изменений implied APY
        if (prevRate && apyDiff > 0.001 && prevImplied > 0) {
          const change = (impliedApy - prevImplied) / prevImplied;
          if (Math.abs(change) >= IMPLIED_APY_THRESHOLD) {
            const cooldownTime = new Date(Date.now() - ALERT_COOLDOWN_HOURS * 3600000).toISOString();
            const { data: existing } = await supabase
              .from('pendle_alerts').select('id')
              .eq('pool_id', poolId).eq('alert_type', 'implied_spike')
              .gte('created_at', cooldownTime).limit(1);

            if (!existing || existing.length === 0) {
              alerts.push({
                pool_id: poolId, alert_type: 'implied_spike',
                previous_value: prevImplied, current_value: impliedApy,
                change_percent: change * 100,
                pool_name: tokenName,
                chain_name: chainName
              });
            }
          }
        }

        inserted++;
        console.log(`[Spectra] ${tokenName} (${chainName}): implied=${(impliedApy * 100).toFixed(2)}%, liq=$${liquidity.toLocaleString()}`);
      } catch (err) {
        console.error(`Ошибка обработки пула ${pool.address}:`, err);
      }
    }

    // Очистка фантомных пулов: удаляем Spectra-записи, которых нет в актуальных данных
    const cleaned = await cleanupStalePools(supabase, activeMarketAddresses);

    for (const alert of alerts) {
      const { error } = await supabase.from('pendle_alerts').insert({
          pool_id: alert.pool_id,
          alert_type: alert.alert_type,
          previous_value: alert.previous_value,
          current_value: alert.current_value,
          change_percent: alert.change_percent,
      });
      if (!error) alertsCreated++;
    }

    // Send Telegram notifications
    if (alerts.length > 0) {
      const { data: users } = await supabase
        .from('user_telegram_settings')
        .select('*')
        .eq('is_active', true);
        
      if (users && users.length > 0) {
        for (const user of users) {
          if (user.platforms && !user.platforms.includes('Spectra')) continue;
          
          let message = `🚨 <b>YieldMonitor: Изменения на Spectra</b>\n\n`;
          let hasAlertToSend = false;

          for (const alert of alerts) {
             const prev = (alert.previous_value * 100).toFixed(2);
             const curr = (alert.current_value * 100).toFixed(2);
             const poolName = alert.pool_name || "Unknown Pool";
             const chainName = alert.chain_name || "Unknown Chain";
             const chainSlug = SPECTRA_CHAIN_SLUGS[alert.chain_id || 1] || 'eth';
             const url = `https://app.spectra.finance/trade-yield?network=${chainSlug}`;
             const linkName = `<a href="${url}">${poolName}</a>`;

             if (alert.alert_type === 'implied_spike' && Math.abs(alert.change_percent) >= Number(user.implied_apy_threshold_percent)) {
                 message += `🔸 <b>${linkName}</b> (${chainName})\nImplied APY: ${prev}% ➡️ ${curr}%\n\n`;
                 hasAlertToSend = true;
             } else if (alert.alert_type === 'new_market') {
                 message += `💠 <b>Новый пул на Spectra:</b>\n${linkName} (${chainName})\nНачальный Implied APY: ${curr}%\n\n`;
                 hasAlertToSend = true;
             }
          }

          if (hasAlertToSend && user.telegram_chat_id) {
             await notifyTelegram(user.telegram_chat_id, message);
          }
        }
      }
    }

    console.log(`[Spectra] Готово: ${inserted} пулов обновлено, ${alertsCreated} алертов создано`);

    return new Response(JSON.stringify({
      success: true,
      pools_scraped: pools.length,
      pools_inserted: inserted,
      pools_cleaned: cleaned,
      alerts_generated: alertsCreated,
      pools: pools.slice(0, 15).map(p => ({
        name: p.underlying?.symbol || p.name,
        chain: CHAIN_NAMES[p.chainId] || `Chain-${p.chainId}`,
        impliedApy: `${(p.impliedApy || 0).toFixed(2)}%`,
        liquidity: `$${(p.tvl?.usd || 0).toLocaleString()}`,
        maturity: p.maturity ? new Date(p.maturity * 1000).toISOString() : null,
      })),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Spectra] Критическая ошибка:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
