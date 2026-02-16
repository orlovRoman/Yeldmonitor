import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Alert thresholds
const IMPLIED_APY_THRESHOLD = 0.01; // 1% change threshold for implied APY

// Exponent Finance is Solana-only
const SOLANA_CHAIN_ID = 501; // Custom chain ID for Solana (Exponent)

interface ExponentPool {
  name: string;
  underlying: string;
  fixedApy: number;
  liquidity: number;
  expiry: string;
  maturityDate: string;
  ptToken: string;
}

// Parse pool data from Firecrawl markdown table
function parseExponentPools(markdown: string): ExponentPool[] {
  const pools: ExponentPool[] = [];

  // Find the table section - Exponent uses a markdown table format
  // Format: | Market | Your Positions | Liquidity | Fixed APY | Time Left |
  const tableMatch = markdown.match(/\| Market \| Your Positions \| Liquidity \| Fixed APY \| Time Left \|[\s\S]*?(?=\n\n[^|]|\n\n$|$)/i);

  if (!tableMatch) {
    console.log('No table found in markdown, trying alternative parsing...');
    // Alternative: parse from individual pool blocks
    return parseExponentPoolsAlternative(markdown);
  }

  const tableContent = tableMatch[0];
  const rows = tableContent.split('\n').filter(row => row.includes('|') && !row.includes('---') && !row.includes('Market'));

  for (const row of rows) {
    try {
      // Parse row like:
      // | ![...](...)eUSXSolstice PT-eUSX-01JUN26![...] | - | $957.80K | 8.56% | 113 days |
      const cells = row.split('|').map(c => c.trim()).filter(c => c);

      if (cells.length < 5) continue;

      const marketCell = cells[0];
      const liquidityCell = cells[2];
      const apyCell = cells[3];
      const timeLeftCell = cells[4];

      // Extract token name and PT token from market cell
      // Pattern: tokenNameProvider PT-token-date
      const tokenMatch = marketCell.match(/([a-zA-Z0-9+]+)([A-Za-z\s]+)\s*\n?\s*(PT-[\w-]+)/);
      let tokenName = '';
      let provider = '';
      let ptToken = '';

      if (tokenMatch) {
        tokenName = tokenMatch[1];
        provider = tokenMatch[2].trim();
        ptToken = tokenMatch[3];
      } else {
        // Try simpler pattern
        const simpleMatch = marketCell.match(/(PT-[\w-]+)/);
        if (simpleMatch) {
          ptToken = simpleMatch[1];
          // Extract token from PT token: PT-eUSX-01JUN26 -> eUSX
          const tokenFromPt = ptToken.match(/PT-([a-zA-Z0-9+]+)-/);
          tokenName = tokenFromPt ? tokenFromPt[1] : ptToken;
        }
      }

      if (!ptToken) continue;

      // Parse liquidity: $957.80K or $16.40M
      const liquidityMatch = liquidityCell.match(/\$([\d.]+)(K|M)?/);
      if (!liquidityMatch) continue;
      let liquidity = parseFloat(liquidityMatch[1]);
      if (liquidityMatch[2] === 'K') liquidity *= 1000;
      if (liquidityMatch[2] === 'M') liquidity *= 1000000;

      // Parse APY: 8.56%
      const apyMatch = apyCell.match(/([\d.]+)%/);
      if (!apyMatch) continue;
      const fixedApy = parseFloat(apyMatch[1]);

      // Parse time left to calculate maturity date
      const timeMatch = timeLeftCell.match(/(\d+)\s*(days?|months?)/i);
      let expiryDate = '';
      if (timeMatch) {
        const days = timeMatch[2].toLowerCase().includes('month')
          ? parseInt(timeMatch[1]) * 30
          : parseInt(timeMatch[1]);
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + days);
        expiryDate = expiry.toISOString();
      }

      // Try to extract expiry from PT token: PT-eUSX-01JUN26 -> 01JUN26
      const dateFromPt = ptToken.match(/(\d{2})([A-Z]{3})(\d{2})$/);
      if (dateFromPt) {
        const monthMap: Record<string, number> = {
          'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
          'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
        };
        const day = parseInt(dateFromPt[1]);
        const month = monthMap[dateFromPt[2]] ?? 0;
        const year = 2000 + parseInt(dateFromPt[3]);
        expiryDate = new Date(year, month, day).toISOString();
      }

      const displayName = provider ? `${tokenName} (${provider})` : tokenName;

      pools.push({
        name: displayName,
        underlying: tokenName,
        fixedApy,
        liquidity,
        expiry: expiryDate,
        maturityDate: expiryDate,
        ptToken,
      });
    } catch (e) {
      console.error('Error parsing row:', e);
    }
  }

  console.log(`Parsed ${pools.length} pools from table`);
  return pools;
}

// Alternative parsing from card blocks
function parseExponentPoolsAlternative(markdown: string): ExponentPool[] {
  const pools: ExponentPool[] = [];

  // Split by "Current Fixed APY" markers
  const blocks = markdown.split(/Current Fixed APY/i);

  for (let i = 1; i < blocks.length; i++) {
    try {
      const block = blocks[i];
      const prevBlock = blocks[i - 1];

      // Extract APY from current block
      const apyMatch = block.match(/^\s*\n?\s*([\d.]+)%/);
      if (!apyMatch) continue;
      const fixedApy = parseFloat(apyMatch[1]);

      // Extract token name from previous block (last token before "Current Fixed APY")
      const tokenMatch = prevBlock.match(/([a-zA-Z0-9+]+)\s*\n\s*Maturity:/i) ||
        prevBlock.match(/\n([a-zA-Z0-9+]+)\s*\n/g);

      let tokenName = '';
      if (tokenMatch) {
        tokenName = Array.isArray(tokenMatch)
          ? tokenMatch[tokenMatch.length - 1].trim().replace(/\n/g, '')
          : tokenMatch[1];
      }

      // Extract maturity
      const maturityMatch = prevBlock.match(/Maturity:\s*(\d{1,2}\s+\w+\s+\d{4})/i) ||
        block.match(/Maturity:\s*(\d{1,2}\s+\w+\s+\d{4})/i);
      let expiryDate = '';
      if (maturityMatch) {
        try {
          expiryDate = new Date(maturityMatch[1]).toISOString();
        } catch {
          console.warn('Could not parse maturity:', maturityMatch[1]);
        }
      }

      // Extract liquidity from nearby content
      const liquidityMatch = block.match(/\$([\d.]+)(K|M)/i) ||
        prevBlock.match(/\$([\d.]+)(K|M)/i);
      let liquidity = 0;
      if (liquidityMatch) {
        liquidity = parseFloat(liquidityMatch[1]);
        if (liquidityMatch[2].toUpperCase() === 'K') liquidity *= 1000;
        if (liquidityMatch[2].toUpperCase() === 'M') liquidity *= 1000000;
      }

      if (tokenName && fixedApy > 0) {
        pools.push({
          name: tokenName,
          underlying: tokenName,
          fixedApy,
          liquidity,
          expiry: expiryDate,
          maturityDate: expiryDate,
          ptToken: `PT-${tokenName}`,
        });
      }
    } catch (e) {
      console.error('Error parsing block:', e);
    }
  }

  console.log(`Parsed ${pools.length} pools from alternative method`);
  return pools;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

    if (!firecrawlApiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting Exponent Finance markets fetch via Firecrawl...');
    const alerts: {
      pool_id: string;
      alert_type: string;
      previous_value: number;
      current_value: number;
      change_percent: number;
      pool_name: string;
    }[] = [];

    // Scrape the Exponent Income page (main pools page)
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.exponent.finance/income',
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 15000,
        timeout: 60000,
      }),
    });

    const scrapeData = await scrapeResponse.json();

    if (!scrapeResponse.ok || !scrapeData.success) {
      console.error('Firecrawl scrape failed:', scrapeData);
      return new Response(
        JSON.stringify({ success: false, error: scrapeData.error || 'Failed to scrape Exponent' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const markdown = scrapeData.data?.markdown || '';
    console.log('Scraped markdown length:', markdown.length);
    console.log('First 2000 chars:', markdown.substring(0, 2000));

    // Parse pools from markdown
    const pools = parseExponentPools(markdown);
    console.log(`Parsed ${pools.length} Exponent pools`);

    // Store pools in database
    let inserted = 0;
    for (const pool of pools) {
      try {
        // Create a unique market address
        const marketAddress = `exponent-${pool.ptToken.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

        // Upsert pool
        const { error: poolError } = await supabase
          .from('pendle_pools')
          .upsert({
            chain_id: SOLANA_CHAIN_ID,
            market_address: marketAddress,
            name: `[Exponent] ${pool.name}`,
            underlying_asset: pool.underlying,
            pt_address: pool.ptToken,
            expiry: pool.expiry || null,
          }, {
            onConflict: 'chain_id,market_address'
          });

        if (poolError) {
          console.error(`Error upserting Exponent pool ${pool.name}:`, poolError);
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
          const impliedApy = pool.fixedApy / 100; // Convert from percent to decimal

          // Get previous rate for comparison
          const { data: prevRate } = await supabase
            .from('pendle_rates_history')
            .select('implied_apy')
            .eq('pool_id', poolId)
            .order('recorded_at', { ascending: false })
            .limit(1)
            .single();

          // Insert rate history
          // Exponent shows "Fixed APY" which is analogous to implied APY
          // Underlying APY for Exponent is typically the base yield of the underlying asset
          // We estimate it as slightly lower than fixed APY
          const underlyingApyEstimate = impliedApy * 0.7;

          await supabase
            .from('pendle_rates_history')
            .insert({
              pool_id: poolId,
              implied_apy: impliedApy,
              underlying_apy: underlyingApyEstimate,
              liquidity: pool.liquidity,
              volume_24h: 0,
            });

          // Check for alerts
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
                  pool_name: pool.name,
                });
              }
            }
          }

          inserted++;
        }
      } catch (error) {
        console.error(`Error processing Exponent pool ${pool.name}:`, error);
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

    console.log(`Successfully inserted/updated ${inserted} Exponent pools`);

    return new Response(JSON.stringify({
      success: true,
      pools_scraped: pools.length,
      pools_inserted: inserted,
      alerts_generated: alerts.length,
      pools: pools.slice(0, 10),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in fetch-exponent-markets:', error);
    return new Response(JSON.stringify({ error: 'An error occurred processing your request' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
