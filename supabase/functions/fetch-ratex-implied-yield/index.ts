const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const apiKey = Deno.env.get('FIRECRAWL_API_KEY');

        // Parse body safely
        let symbols: string[] = [];
        try {
            const body = await req.json();
            symbols = body?.symbols || [];
        } catch {
            // If no body, return help message
            return new Response(
                JSON.stringify({
                    success: true,
                    message: 'Send POST with {symbols: ["xSOL-2604"]}',
                    data: []
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!apiKey) {
            return new Response(
                JSON.stringify({ success: false, error: 'FIRECRAWL_API_KEY not configured' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!Array.isArray(symbols) || symbols.length === 0) {
            return new Response(
                JSON.stringify({ success: false, error: 'symbols array is required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log(`Fetching implied yields for ${symbols.length} symbols`);

        const results: any[] = [];

        // Process one by one
        for (const symbol of symbols) {
            const url = `https://app.rate-x.io/leverage/${symbol}`;
            console.log(`Scraping: ${url}`);

            try {
                const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        url: url,
                        formats: ['markdown'],
                        onlyMainContent: true,
                        waitFor: 5000,
                    }),
                });

                const data = await response.json();

                if (response.ok && data.data?.markdown) {
                    const markdown = data.data.markdown;
                    console.log(`[Scrape] ${symbol} markdown preview:`, markdown.substring(0, 500));

                    // Try multiple patterns for Implied Yield
                    let impliedYield: number | null = null;
                    let realYield: number | null = null;

                    // Pattern 1: "Implied Yield 18.886%"
                    const impliedMatch1 = markdown.match(/Implied\s*Yield[\s:]*([\d.]+)%/i);
                    // Pattern 2: "Implied Yield: 18.886%"  
                    const impliedMatch2 = markdown.match(/Implied\s*Yield\s*[:\s]*([\d.]+)%/i);
                    // Pattern 3: Just look for percentage after "Implied"
                    const impliedMatch3 = markdown.match(/Implied[^\d]*([\d.]+)%/i);

                    if (impliedMatch1) {
                        impliedYield = parseFloat(impliedMatch1[1]) / 100;
                        console.log(`[Scrape] ${symbol} matched pattern 1: ${impliedMatch1[1]}%`);
                    } else if (impliedMatch2) {
                        impliedYield = parseFloat(impliedMatch2[1]) / 100;
                        console.log(`[Scrape] ${symbol} matched pattern 2: ${impliedMatch2[1]}%`);
                    } else if (impliedMatch3) {
                        impliedYield = parseFloat(impliedMatch3[1]) / 100;
                        console.log(`[Scrape] ${symbol} matched pattern 3: ${impliedMatch3[1]}%`);
                    }

                    // Real Yield patterns
                    const realMatch = markdown.match(/Real\s*Yield[\s:]*([\d.]+)%/i);
                    if (realMatch) {
                        realYield = parseFloat(realMatch[1]) / 100;
                    }

                    if (impliedYield !== null) {
                        results.push({
                            symbol,
                            impliedYield,
                            realYield: realYield || 0,
                            timestamp: new Date().toISOString(),
                        });
                        console.log(`[Scrape] ${symbol} result: implied=${impliedYield}, real=${realYield}`);
                    } else {
                        console.log(`[Scrape] ${symbol} no match found`);
                    }
                }
            } catch (e) {
                console.error(`Error scraping ${symbol}:`, e);
            }
        }

        console.log(`Results: ${results.length}`);

        return new Response(
            JSON.stringify({ success: true, data: results }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error:', errorMessage);
        return new Response(
            JSON.stringify({ success: false, error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
