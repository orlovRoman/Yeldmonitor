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
    const alertTypeLabels: Record<string, string> = {
      'implied_spike': 'резкое изменение подразумеваемой доходности',
      'underlying_spike': 'резкое изменение фактической доходности',
      'yield_divergence': 'превышение фактической доходности над подразумеваемой',
    };

    // Build search query for Perplexity
    const searchQuery = `Pendle Finance ${pool.underlying_asset || pool.name} yield APY change DeFi news today. What could cause ${alertTypeLabels[alert.alert_type] || 'yield change'} in Pendle ${pool.name}? Check Twitter, Discord, crypto news.`;

    console.log('Searching with Perplexity:', searchQuery);

    // Call Perplexity API
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
            content: `Ты аналитик DeFi. Твоя задача - найти причину резкого изменения доходности в пуле Pendle Finance. 
Отвечай на русском языке. Будь кратким и конкретным.
Укажи:
1. Вероятную причину изменения
2. Источники информации (Twitter, Discord, новости)
3. Рекомендации по действиям`
          },
          {
            role: 'user',
            content: `Пул: ${pool.name}
Актив: ${pool.underlying_asset || 'Unknown'}
Тип события: ${alertTypeLabels[alert.alert_type]}
Предыдущее значение: ${(Number(alert.previous_value) * 100).toFixed(2)}%
Текущее значение: ${(Number(alert.current_value) * 100).toFixed(2)}%
Изменение: ${Number(alert.change_percent).toFixed(2)}%

Найди причину этого изменения в последних новостях и социальных сетях.`
          }
        ],
        search_recency_filter: 'day',
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
