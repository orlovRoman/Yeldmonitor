import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Alert thresholds (same as Pendle)
const IMPLIED_APY_THRESHOLD = 0.01; // 1% change threshold for implied APY
const ALERT_COOLDOWN_HOURS = 1; // Prevent duplicate alerts within this window

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

// Parse pool data from Firecrawl markdown - improved version
function parseSpectraPools(markdown: string): SpectraPool[] {
  const pools: SpectraPool[] = [];

  // Chain slug to chain ID mapping
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

  // Split by pool link entries - each pool card ends with a link to the pool
  // Support both /pools/ and /yield/ or other variations if they exist
  // Pattern: [link text](https://app.spectra.finance/pools/chainSlug:0xaddress)
  const poolLinkRegex = /\[([^\]]*)\]\(https:\/\/app\.spectra\.finance\/(?:pools|yield|liquidity)\/(\w+)[:/](0x[a-f0-9]+)\)/gi;

  const matches = [...markdown.matchAll(poolLinkRegex)];
  console.log(`[Spectra Parser] Found ${matches.length} matches for pool links`);

  for (const match of matches) {
    const linkText = match[1];
    const chainSlug = match[2].toLowerCase();
    const poolAddress = match[3];
    const chainId = chainSlugToId[chainSlug] || 1;

    // Find the section before this link to extract pool data
    const linkPos = match.index!;
    const sectionStart = Math.max(0, linkPos - 1500); // Look back up to 1500 chars
    const sectionBefore = markdown.slice(sectionStart, linkPos);

    // Combine section before and link text for searching, as data can be in either
    const combinedSection = sectionBefore + "\n" + linkText;

    // Extract Max APY - this is the implied APY equivalent
    // Look for patterns like "Max APY\n\n14.89%" or "92.22%\n\nInterest-Bearing"
    const maxApyPatterns = [
      /Max APY[\s\\n]*([0-9.]+)%/i,
      /([0-9.]+)%[\s\\n]*\+?[\s\\n]*Interest-Bearing/i,
      /APY[\s\\n]*([0-9.]+)%/i,
    ];

    let maxApy = 0;
    for (const pattern of maxApyPatterns) {
      const apyMatch = combinedSection.match(pattern);
      if (apyMatch) {
        maxApy = parseFloat(apyMatch[1]);
        break;
      }
    }

    if (maxApy === 0 || isNaN(maxApy)) {
      console.log(`Skipping pool ${poolAddress} - no APY found in combined section: ${combinedSection.slice(-300)}`);
      continue;
    }

    // Extract underlying APY (PT APY, Fixed APY, Base APY)
    const underlyingPatterns = [
      /PT APY[\s\\n]*([0-9.]+)%/i,
      /Fixed APY[\s\\n]*([0-9.]+)%/i,
      /Base APY[\s\\n]*([0-9.]+)%/i,
      /Interest-Bearing[\s\\n]*([0-9.]+)%/i,
    ];

    let underlyingApy: number | null = null;
    for (const pattern of underlyingPatterns) {
      const underlyingMatch = combinedSection.match(pattern);
      if (underlyingMatch) {
        underlyingApy = parseFloat(underlyingMatch[1]);
        break;
      }
    }

    // Extract Liquidity
    const liquidityPatterns = [
      /Liquidity[\s\\n]*\$([\d,]+)/i,
      /\$([\d,]+)[\s\\n]*(?:Liquidity|Expiry)/i,
      /\$([\d,]{2,})[\s\\n]*/,
    ];

    let liquidity = 0;
    for (const pattern of liquidityPatterns) {
      const liqMatch = combinedSection.match(pattern);
      if (liqMatch) {
        liquidity = parseInt(liqMatch[1].replace(/,/g, ''));
        break;
      }
    }

    // Extract token name patterns
    const tokenPatterns = [
      /\b(vb[A-Z0-9]+)\b/i,      // Yearn vaults like vbUSDC
      /\b(st[A-Z0-9]+)\b/i,      // Staked tokens like stXRP
      /\b(sav[A-Z0-9]+)\b/i,     // Savings tokens
      /\b(yv[A-Z0-9]+)\b/i,      // Yearn vaults
      /\b(ynETH[\w-/]*)\b/i,     // ynETH variants
      /\b(sj[A-Z0-9]+)\b/i,      // SJ tokens
      /\b(av[A-Z0-9]+)\b/i,      // Avalanche tokens
      /\b(re[A-Z0-9]+)\b/i,      // reETH etc
      /\b(hb[A-Z0-9]+)\b/i,      // HB tokens
      /\b(BOLD|USDN|HYPE|AUSD|USDC|jEUR[x]?|wETH|cbBTC|avax)\b/i,
    ];

    // Extract Expiry - prioritize search in linkText
    let expiry = '';
    const expiryMatch = linkText.match(/Expiry[\s\\n]*([A-Z][a-z]+ \d{1,2} \d{4})/i) ||
      sectionBefore.match(/Expiry[\s\\n]*([A-Z][a-z]+ \d{1,2} \d{4})/i);
    if (expiryMatch) expiry = expiryMatch[1];

    // Extract token name - check link text first as it's most reliable now
    let tokenName = '';

    // Look in linkText first
    for (const pattern of tokenPatterns) {
      const tokenMatch = linkText.match(pattern);
      if (tokenMatch) {
        tokenName = tokenMatch[1];
        break;
      }
    }

    // If not found, look in the area before the link
    if (!tokenName) {
      const nearSection = markdown.slice(Math.max(0, linkPos - 500), linkPos);
      for (const pattern of tokenPatterns) {
        const tokenMatch = nearSection.match(pattern);
        if (tokenMatch) {
          tokenName = tokenMatch[1];
          break;
        }
      }
    }

    if (!tokenName) {
      tokenName = `Pool-${poolAddress.slice(2, 10)}`;
    }

    // Cap max APY at 200% to avoid parsing errors
    const finalMaxApy = maxApy > 200 ? 200 : maxApy;

    pools.push({
      name: tokenName,
      underlying: tokenName.replace(/[^a-zA-Z0-9]/g, ''),
      maxApy: finalMaxApy,
      underlyingApy,
      liquidity,
      expiry,
      chainId,
      chainName: SPECTRA_CHAINS[chainId] || 'Unknown',
      poolAddress,
    });

    console.log(`Parsed pool: ${tokenName} on ${SPECTRA_CHAINS[chainId]}, APY: ${finalMaxApy}%, Liquidity: $${liquidity}`);
  }

  // Remove duplicates based on poolAddress (same pool might appear multiple times)
  const uniquePools = pools.filter((pool, index, self) =>
    index === self.findIndex(p => p.poolAddress === pool.poolAddress)
  );

  console.log(`Parsed ${uniquePools.length} unique pools from Spectra markdown (${pools.length} total matches)`);
  return uniquePools;
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
    const alerts: {
      pool_id: string;
      alert_type: string;
      previous_value: number;
      current_value: number;
      change_percent: number;
      pool_name: string;
      chain_name: string;
    }[] = [];

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
        timeout: 60000,
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
    console.log(`[Spectra Scraper] Parsed ${pools.length} Spectra pools`);

    if (pools.length === 0) {
      console.warn('[Spectra Scraper] No pools parsed. Markdown snippet:', markdown.slice(0, 500));
    }

    // Store pools in database
    let inserted = 0;
    let alertsCreated = 0;

    for (const pool of pools) {
      try {
        // Create a unique market address based on pool address and chain
        const marketAddress = `spectra-${pool.chainId}-${pool.poolAddress.slice(2, 14).toLowerCase()}`;

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

          // Only insert rate if it changed significantly (>0.1% difference) to avoid noise
          const prevImplied = prevRate ? Number(prevRate.implied_apy) : 0;
          const apyDifference = Math.abs(impliedApy - prevImplied);

          if (!prevRate || apyDifference > 0.001) {
            // Use underlyingApy from scraping if available, otherwise estimate
            const underlyingApyValue = pool.underlyingApy !== null
              ? pool.underlyingApy / 100
              : (impliedApy * 0.5);

            await supabase
              .from('pendle_rates_history')
              .insert({
                pool_id: poolId,
                implied_apy: impliedApy,
                underlying_apy: underlyingApyValue,
                liquidity: pool.liquidity,
                volume_24h: 0,
              });

            console.log(`Inserted rate for ${pool.name}: ${(impliedApy * 100).toFixed(2)}%`);
          }

          // Check for alerts - only if rate changed significantly
          if (prevRate && apyDifference > 0.001) {
            // Check implied APY spike (1% threshold)
            if (prevImplied > 0) {
              const impliedChange = (impliedApy - prevImplied) / prevImplied;

              if (Math.abs(impliedChange) >= IMPLIED_APY_THRESHOLD) {
                // CHECK FOR DUPLICATE ALERTS - prevent alert spam
                const cooldownTime = new Date(Date.now() - ALERT_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();

                const { data: existingAlerts } = await supabase
                  .from('pendle_alerts')
                  .select('id')
                  .eq('pool_id', poolId)
                  .eq('alert_type', 'implied_spike')
                  .gte('created_at', cooldownTime)
                  .limit(1);

                // Only create alert if no recent alert exists for this pool
                if (!existingAlerts || existingAlerts.length === 0) {
                  alerts.push({
                    pool_id: poolId,
                    alert_type: 'implied_spike',
                    previous_value: prevImplied,
                    current_value: impliedApy,
                    change_percent: impliedChange * 100,
                    pool_name: pool.name,
                    chain_name: pool.chainName,
                  });
                } else {
                  console.log(`Skipping duplicate alert for ${pool.name} - alert exists within ${ALERT_COOLDOWN_HOURS}h`);
                }
              }
            }
          }

          inserted++;
        }
      } catch (error) {
        console.error(`Error processing Spectra pool ${pool.name}:`, error);
      }
    }

    console.log(`Generated ${alerts.length} new alerts for Spectra pools`);

    // Insert alerts
    for (const alert of alerts) {
      const { error } = await supabase
        .from('pendle_alerts')
        .insert({
          pool_id: alert.pool_id,
          alert_type: alert.alert_type,
          previous_value: alert.previous_value,
          current_value: alert.current_value,
          change_percent: alert.change_percent,
        });

      if (!error) {
        alertsCreated++;
      }
    }

    console.log(`Successfully inserted/updated ${inserted} Spectra pools, created ${alertsCreated} alerts`);

    return new Response(JSON.stringify({
      success: true,
      pools_scraped: pools.length,
      pools_inserted: inserted,
      alerts_generated: alertsCreated,
      pools: pools.slice(0, 10),
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
