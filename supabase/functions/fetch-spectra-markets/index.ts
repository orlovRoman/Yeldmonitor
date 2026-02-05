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
  liquidity: number;
  expiry: string;
  chainId: number;
  chainName: string;
  poolAddress: string;
}

// Parse pool data from Firecrawl markdown
function parseSpectraPools(markdown: string): SpectraPool[] {
  const pools: SpectraPool[] = [];
  
  // The pools are in markdown links format: [![ChainName]...pool data...](pool_url)
  // Pattern: [![ChainName](chain_img)...name...Max APY...XX%...Liquidity...$X...Expiry...Date...\n\n![chainId]...](pool_url)
  
  // Split by pool link pattern - each pool ends with a URL like ](https://app.spectra.finance/pools/chain:address)
  const poolRegex = /\[!\[([\w\s]+)\][^\]]*\]\([^\)]+\)[^[]*?([\w\-\/]+)[^[]*?Max APY[^[]*?([\d.]+%?\+?)[^[]*?Interest-Bearing Token[^[]*?Liquidity[^[]*?\$([\d,]+)[^[]*?Expiry[^[]*?([A-Z][a-z]+ \d{1,2} \d{4})[^[]*?\]\(https:\/\/app\.spectra\.finance\/pools\/([\w]+):(0x[a-f0-9]+)\)/gi;
  
  let match;
  while ((match = poolRegex.exec(markdown)) !== null) {
    const chainName = match[1].trim();
    const name = match[2].trim();
    const apyStr = match[3].replace('%', '').replace('+', '').trim();
    const liquidityStr = match[4].replace(/,/g, '');
    const expiryStr = match[5];
    const chainSlug = match[6];
    const poolAddress = match[7];
    
    // Map chain slug to chain ID
    let chainId = 1;
    if (chainSlug === 'katana' || chainName.includes('Katana')) chainId = 747474;
    else if (chainSlug === 'avax' || chainName.includes('Avalanche')) chainId = 43114;
    else if (chainSlug === 'flare' || chainName.includes('Flare')) chainId = 14;
    else if (chainSlug === 'base' || chainName.includes('Base')) chainId = 8453;
    else if (chainSlug === 'eth' || chainName.includes('Ethereum')) chainId = 1;
    else if (chainSlug === 'arbitrum' || chainName.includes('Arbitrum')) chainId = 42161;
    else if (chainSlug === 'op' || chainName.includes('Optimism')) chainId = 10;
    else if (chainSlug === 'hyperevm' || chainName.includes('HyperEVM')) chainId = 999;
    else if (chainSlug === 'sonic' || chainName.includes('Sonic')) chainId = 146;
    
    const apy = parseFloat(apyStr);
    const liquidity = parseInt(liquidityStr) || 0;
    
    if (!isNaN(apy) && liquidity > 0) {
      pools.push({
        name,
        underlying: name.split('-')[0].trim(),
        maxApy: apy > 200 ? 200 : apy, // Cap at 200%
        liquidity,
        expiry: expiryStr,
        chainId,
        chainName: SPECTRA_CHAINS[chainId] || chainName,
        poolAddress,
      });
    }
  }
  
  // If regex didn't work, try simpler approach - parse the structured data
  if (pools.length === 0) {
    console.log('Regex parsing failed, trying alternative method');
    
    // Split by pool entries using the link pattern
    const poolBlocks = markdown.split(/\]\(https:\/\/app\.spectra\.finance\/pools\//);
    
    for (let i = 0; i < poolBlocks.length - 1; i++) {
      const block = poolBlocks[i];
      const nextBlock = poolBlocks[i + 1];
      
      // Extract pool URL info from next block
      const urlMatch = nextBlock.match(/^([\w]+):(0x[a-f0-9]+)\)/i);
      if (!urlMatch) continue;
      
      const chainSlug = urlMatch[1];
      const poolAddress = urlMatch[2];
      
      // Extract APY - handle the \\n\\n format in scraped markdown
      const apyMatch = block.match(/Max APY[\\\s\n]*([0-9.]+)%?\+?/i) ||
                       block.match(/([0-9.]+)%[\\\s\n]*Interest-Bearing/i);
      if (!apyMatch) continue;
      
      // Extract Liquidity
      const liquidityMatch = block.match(/Liquidity[\\\s\n]*\$([\d,]+)/i) ||
                             block.match(/\$([\d,]+)[\\\s\n]*Expiry/i);
      if (!liquidityMatch) continue;
      
      // Extract Expiry
      const expiryMatch = block.match(/Expiry[\\\s\n]*([A-Z][a-z]+ \d{1,2} \d{4})/i);
      
      // Extract name and provider - format is: asset\\n\\nProvider\\n\\nMax APY
      // Look for token symbols: vbUSDC, stXRP, avUSD, BOLD, USDN, HYPE, AUSD, jEURx, etc.
      const tokenMatch = block.match(/\\n\\n([\w\-\/]+)\\n\\n([\w\s\(\)]+)\\n\\nMax APY/i) ||
                         block.match(/\]([\w\-\/]+)\\n\\n([\w\s\(\)]+)\\n\\nMax APY/i);
      
      // Also try to find common token patterns directly  
      const simpleTokenMatch = block.match(/(vb[A-Z]+|st[A-Z]+|sav[A-Z]+|yv[A-Z]+|sj[A-Z]+|av[A-Z]+|re[A-Z]+|hb[A-Z]+|yn[A-Z\-\/]+|BOLD|USDN|HYPE|AUSD|USDC|jEUR[x]?)/i);
      
      let name: string;
      let provider = '';
      if (tokenMatch) {
        name = tokenMatch[1].trim();
        provider = tokenMatch[2].trim();
      } else if (simpleTokenMatch) {
        name = simpleTokenMatch[1];
        // Try to find provider after the token name
        const providerMatch = block.match(new RegExp(name + '\\\\n\\\\n([A-Za-z0-9\\s\\(\\)]+)\\\\n\\\\nMax', 'i'));
        if (providerMatch) provider = providerMatch[1].trim();
      } else {
        name = `Pool-${poolAddress.slice(0, 8)}`;
      }
      
      // Create a readable display name
      const displayName = provider ? `${name} (${provider})` : name;
      
      // Map chain
      let chainId = 1;
      if (chainSlug === 'katana') chainId = 747474;
      else if (chainSlug === 'avax') chainId = 43114;
      else if (chainSlug === 'flare') chainId = 14;
      else if (chainSlug === 'base') chainId = 8453;
      else if (chainSlug === 'eth') chainId = 1;
      else if (chainSlug === 'hyperevm') chainId = 999;
      else if (chainSlug === 'sonic') chainId = 146;
      else if (chainSlug === 'arbitrum') chainId = 42161;
      else if (chainSlug === 'op') chainId = 10;
      
      const apy = parseFloat(apyMatch[1]);
      const liquidity = parseInt(liquidityMatch[1].replace(/,/g, ''));
      
      if (!isNaN(apy) && liquidity > 0) {
        pools.push({
          name: displayName,
          underlying: name.split('-')[0].replace(/[^a-zA-Z0-9]/g, '') || name,
          maxApy: apy > 200 ? 200 : apy,
          liquidity,
          expiry: expiryMatch ? expiryMatch[1] : '',
          chainId,
          chainName: SPECTRA_CHAINS[chainId] || 'Unknown',
          poolAddress,
        });
      }
    }
  }
  
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
        waitFor: 8000, // Wait for dynamic content to load
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
          await supabase
            .from('pendle_rates_history')
            .insert({
              pool_id: poolId,
              implied_apy: impliedApy,
              underlying_apy: 0, // Spectra shows Max APY which is similar to implied
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
