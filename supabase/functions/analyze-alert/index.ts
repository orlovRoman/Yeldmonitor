import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { alertId } = await req.json();
    
    if (!alertId) {
      return new Response(JSON.stringify({ error: 'alertId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get alert details with pool info
    const { data: alert, error: alertError } = await supabase
      .from('pendle_alerts')
      .select(`
        *,
        pendle_pools (
          name,
          chain_id,
          underlying_asset,
          market_address
        )
      `)
      .eq('id', alertId)
      .single();

    if (alertError || !alert) {
      return new Response(JSON.stringify({ error: 'Alert not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const pool = alert.pendle_pools;
    
    // Determine direction
    const changePercent = Number(alert.change_percent);
    const direction = changePercent >= 0 ? 'рост' : 'падение';
    
    const alertTypeLabels: Record<string, string> = {
      'implied_spike': `${direction} подразумеваемой доходности (Implied APY)`,
      'underlying_spike': `${direction} фактической доходности (Underlying APY)`,
      'yield_divergence': 'расхождение между фактической и подразумеваемой доходностью',
    };

    const underlyingAsset = pool.underlying_asset || pool.name;

    // Build search query for Perplexity with more specific DeFi news sources
    const searchQuery = `${underlyingAsset} DeFi yield APY ${direction} news today site:twitter.com OR site:x.com OR site:medium.com OR site:defillama.com`;

    console.log('Searching with Perplexity:', searchQuery);

    // Call Perplexity API with improved prompt
    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: `Ты аналитик DeFi. Твоя задача - найти причину изменения доходности в пуле Pendle Finance.
Отвечай на русском языке. Будь кратким и конкретным (максимум 200 слов).
Укажи:
1. Вероятную причину изменения (протокольные обновления, изменение эмиссии, рыночные условия, действия крупных игроков)
2. Если нашёл конкретные источники - укажи их
3. Краткие рекомендации по действиям

Если не можешь найти конкретную причину, предположи наиболее вероятные сценарии на основе типа актива и текущих рыночных условий.`
          },
          {
            role: 'user',
            content: `Пул: ${pool.name}
Актив: ${underlyingAsset}
Сеть: ${pool.chain_id === 1 ? 'Ethereum' : pool.chain_id === 42161 ? 'Arbitrum' : pool.chain_id === 999 ? 'Hyperliquid' : 'другая'}
Тип события: ${alertTypeLabels[alert.alert_type]}
Предыдущее значение: ${(Number(alert.previous_value) * 100).toFixed(2)}%
Текущее значение: ${(Number(alert.current_value) * 100).toFixed(2)}%
Изменение: ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%

Найди причину этого ${direction}а доходности. Проверь последние новости о ${underlyingAsset}, изменения в протоколах, крупные транзакции.`
          }
        ],
        search_recency_filter: 'week',
      }),
    });

    if (!perplexityResponse.ok) {
      const errorText = await perplexityResponse.text();
      console.error('Perplexity API error:', errorText);
      throw new Error(`Perplexity API error: ${perplexityResponse.status}`);
    }

    const perplexityData = await perplexityResponse.json();
    const analysis = perplexityData.choices?.[0]?.message?.content || 'Анализ недоступен';
    const citations = perplexityData.citations || [];

    console.log('Perplexity analysis complete');

    // Update alert with analysis
    const { error: updateError } = await supabase
      .from('pendle_alerts')
      .update({
        ai_analysis: analysis,
        sources: citations,
        status: 'reviewed',
      })
      .eq('id', alertId);

    if (updateError) {
      console.error('Error updating alert:', updateError);
    }

    return new Response(JSON.stringify({
      success: true,
      analysis,
      sources: citations,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-alert:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
