import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Alert thresholds (same as Pendle)
const IMPLIED_APY_THRESHOLD = 0.01; // 1% change threshold for implied APY

// Spectra Finance supported chains
const SPECTRA_CHAINS: Record<number, string> = {
  1: 'Ethereum',
  42161: 'Arbitrum',
  10: 'Optimism',
  8453: 'Base',
  146: 'Sonic',
  43114: 'Avalanche',
  56: 'BNB Chain',
  14: 'Flare',
  747474: 'Katana',
  999: 'HyperEVM',
};

interface SpectraPool {
  name: string;
  underlying: string;
  maxApy: number;
  underlyingApy: number | null;
  liquidity: number;
  expiry: string;
  chainId: number;
  chainName: string;
  poolAddress: string;
}

// Parse pool data from Firecrawl markdown
function parseSpectraPools(markdown: string): SpectraPool[] {
  const pools: SpectraPool[] = [];

  // Chain slug to chain ID mapping - the URL slug is the SOURCE OF TRUTH for chain
  const chainSlugToId: Record<string, number> = {
    'eth': 1,
    'ethereum': 1,
    'arbitrum': 42161,
    'arb': 42161,
    'op': 10,
    'optimism': 10,
    'base': 8453,
    'sonic': 146,
    'avax': 43114,
    'avalanche': 43114,
    'bsc': 56,
    'bnb': 56,
    'flare': 14,
    'katana': 747474,
    'hyperevm': 999,
  };

  // Split by pool entries using the link pattern
  const poolBlocks = markdown.split(/\]\(https:\/\/app\.spectra\.finance\/pools\//);

  for (let i = 0; i < poolBlocks.length - 1; i++) {
    const block = poolBlocks[i];
    const nextBlock = poolBlocks[i + 1];

    // Extract pool URL info from next block - this determines the chain
    const urlMatch = nextBlock.match(/^([\w]+):(0x[a-f0-9]+)\)/i);
    if (!urlMatch) continue;

    const chainSlug = urlMatch[1].toLowerCase();
    const poolAddress = urlMatch[2];

    // Chain ID from URL slug - the ONLY source of truth
    const chainId = chainSlugToId[chainSlug] || 1;

    // Extract Max APY (implied APY equivalent)
    const maxApyMatch = block.match(/Max APY[\\\s\n]*([0-9.]+)%?\+?/i) ||
                     block.match(/([0-9.]+)%[\\\s\n]*Interest-Bearing/i);
    if (!maxApyMatch) continue;

    // Extract Underlying APY (look for patterns like "PT APY" or "Fixed APY" or "Base APY")
    // Spectra shows different yield components - we look for any secondary APY indicator
    const underlyingApyMatch = block.match(/PT APY[\\\s\n]*([0-9.]+)%/i) ||
                               block.match(/Fixed APY[\\\s\n]*([0-9.]+)%/i) ||
                               block.match(/Base APY[\\\s\n]*([0-9.]+)%/i) ||
                               block.match(/Interest-Bearing[\\\s\n]*([0-9.]+)%/i);
    
    const underlyingApy = underlyingApyMatch ? parseFloat(underlyingApyMatch[1]) : null;

    // Extract Liquidity
    const liquidityMatch = block.match(/Liquidity[\\\s\n]*\$([\d,]+)/i) ||
                           block.match(/\$([\d,]+)[\\\s\n]*Expiry/i);
    if (!liquidityMatch) continue;

    // Extract Expiry
    const expiryMatch = block.match(/Expiry[\\\s\n]*([A-Z][a-z]+ \d{1,2} \d{4})/i);

    // Extract token name - try patterns
    let tokenName = '';
    let provider = '';

    const tokenProviderMatch = block.match(/\\n\\n([\w\-\/\.]+)\\n\\n([\w\s\(\)\.]+)\\n\\nMax APY/i);
    if (tokenProviderMatch) {
      tokenName = tokenProviderMatch[1].trim();
      provider = tokenProviderMatch[2].trim();
    } else {
      // Common yield token patterns
      const tokenPatterns = [
        /(vb[A-Z0-9]+)/i, /(st[A-Z0-9]+)/i, /(sav[A-Z0-9]+)/i, /(yv[A-Z0-9]+)/i,
        /(ynETH[\w\-\/]*)/i, /(sj[A-Z0-9]+)/i, /(av[A-Z0-9]+)/i, /(re[A-Z0-9]+)/i,
        /(hb[A-Z0-9]+)/i, /(BOLD|USDN|HYPE|AUSD|USDC|jEUR[x]?|wETH|cbBTC)/i,
      ];

      for (const pattern of tokenPatterns) {
        const match = block.match(pattern);
        if (match) {
          tokenName = match[1];
          break;
        }
      }

      if (!tokenName) {
        tokenName = `Pool-${poolAddress.slice(2, 10)}`;
      }
    }

    const displayName = provider ? `${tokenName} (${provider})` : tokenName;

    const maxApy = parseFloat(maxApyMatch[1]);
    const liquidity = parseInt(liquidityMatch[1].replace(/,/g, ''));

    if (!isNaN(maxApy) && liquidity > 0) {
      pools.push({
        name: displayName,
        underlying: tokenName.replace(/[^a-zA-Z0-9]/g, ''),
        maxApy: maxApy > 200 ? 200 : maxApy,
        underlyingApy: underlyingApy,
        liquidity,
        expiry: expiryMatch ? expiryMatch[1] : '',
        chainId,
        chainName: SPECTRA_CHAINS[chainId] || 'Unknown',
        poolAddress,
      });
    }
  }

  console.log(`Parsed ${pools.length} pools from Spectra markdown`);
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

    console.log('Starting Spectra Finance markets fetch via Firecrawl...');
    const alerts: any[] = [];

    // Scrape the Spectra pools page
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://app.spectra.finance/pools',
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 15000,
        timeout: 60000, // 60 seconds total timeout
      }),
    });

    const scrapeData = await scrapeResponse.json();

    if (!scrapeResponse.ok || !scrapeData.success) {
      console.error('Firecrawl scrape failed:', scrapeData);
      return new Response(
        JSON.stringify({ success: false, error: scrapeData.error || 'Failed to scrape Spectra' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const markdown = scrapeData.data?.markdown || '';
    console.log('Scraped markdown length:', markdown.length);

    // Parse pools from markdown
    const pools = parseSpectraPools(markdown);
    console.log(`Parsed ${pools.length} Spectra pools`);

    // Store pools in database
    let inserted = 0;
    for (const pool of pools) {
      try {
        // Create a unique market address based on pool name and chain
        const marketAddress = `spectra-${pool.chainId}-${pool.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
        
        // Parse expiry date
        let expiryDate: string | null = null;
        if (pool.expiry) {
          try {
            expiryDate = new Date(pool.expiry).toISOString();
          } catch {
            console.warn('Could not parse expiry date:', pool.expiry);
          }
        }
        
        // Upsert pool
        const { error: poolError } = await supabase
          .from('pendle_pools')
          .upsert({
            chain_id: pool.chainId,
            market_address: marketAddress,
            name: `[Spectra] ${pool.name}`,
            underlying_asset: pool.underlying,
            expiry: expiryDate,
          }, {
            onConflict: 'chain_id,market_address'
          });

        if (poolError) {
          console.error(`Error upserting Spectra pool ${pool.name}:`, poolError);
          continue;
        }

        // Get the pool ID
        const { data: poolData } = await supabase
          .from('pendle_pools')
          .select('id')
          .eq('chain_id', pool.chainId)
          .eq('market_address', marketAddress)
          .single();

        if (poolData) {
          const poolId = poolData.id;
          const impliedApy = pool.maxApy / 100; // Convert from percent to decimal
          
          // Get previous rate for comparison
          const { data: prevRate } = await supabase
            .from('pendle_rates_history')
            .select('implied_apy, underlying_apy')
            .eq('pool_id', poolId)
            .order('recorded_at', { ascending: false })
            .limit(1)
            .single();

          // Insert rate history with the scraped APY
          // Use underlyingApy from scraping if available, otherwise estimate as ~50% of maxApy
          const underlyingApyValue = pool.underlyingApy !== null 
            ? pool.underlyingApy / 100 
            : (impliedApy * 0.5); // Fallback: estimate underlying as half of max APY
          
          await supabase
            .from('pendle_rates_history')
            .insert({
              pool_id: poolId,
              implied_apy: impliedApy,
              underlying_apy: underlyingApyValue,
              liquidity: pool.liquidity,
              volume_24h: 0,
            });
          
          // Check for alerts - compare with previous rate
          if (prevRate) {
            const prevImplied = Number(prevRate.implied_apy) || 0;
            
            // Check implied APY spike (1% threshold)
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
                  chain_name: pool.chainName,
                });
              }
            }
          }
          
          inserted++;
        }
      } catch (error) {
        console.error(`Error processing Spectra pool ${pool.name}:`, error);
      }
    }

    console.log(`Generated ${alerts.length} alerts for Spectra pools`);

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

    console.log(`Successfully inserted/updated ${inserted} Spectra pools`);

    return new Response(JSON.stringify({
      success: true,
      pools_scraped: pools.length,
      pools_inserted: inserted,
      alerts_generated: alerts.length,
      pools: pools.slice(0, 10), // Return first 10 for debugging
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in fetch-spectra-markets:', error);
    return new Response(JSON.stringify({ error: 'An error occurred processing your request' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
