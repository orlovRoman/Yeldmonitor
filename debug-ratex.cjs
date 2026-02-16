const { createClient } = require('@supabase/supabase-js');

const url = 'https://wtdfsugadogbrsxoystl.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0ZGZzdWdhZG9nYnJzeG95c3RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4MzEwNDYsImV4cCI6MjA4MzQwNzA0Nn0.u0lKLmftO6quqp_iWH8pIFlbUZcH6PTUPiXOKeTsYh0';
// Using service role key if available, but I only have anon key in my previous commands. 
// Wait, I need the service role key to insert into pendle_pools (RLS).
// I'll try to use the key I've been using, but it might fail if it's not service role.

const supabase = createClient(url, key);

async function runRateXScraper() {
    console.log('Fetching RateX symbols...');
    const response = await fetch('https://api.rate-x.io/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            serverName: 'AdminSvr',
            method: 'querySymbol',
            content: { cid: 'debug-' + Date.now() }
        })
    });

    const data = await response.json();
    if (data.code !== 0) {
        console.error('API Error:', data.msg);
        return;
    }

    const markets = data.data || [];
    console.log(`Found ${markets.length} markets.`);

    for (const market of markets.slice(0, 3)) { // Test with first 3
        const marketAddress = `ratex-${market.symbol}`;
        console.log(`Processing ${market.symbol_name} (${marketAddress})...`);

        // Attempt upsert (might fail if anon key)
        const { data: pool, error } = await supabase
            .from('pendle_pools')
            .upsert({
                chain_id: 502,
                market_address: marketAddress,
                name: `[RateX] ${market.symbol_name || market.symbol}`,
                underlying_asset: market.symbol_level1_category || null,
                expiry: market.due_date || null,
            }, { onConflict: 'chain_id,market_address' })
            .select('id')
            .single();

        if (error) {
            console.error(`Upsert error for ${market.symbol}:`, error.message);
        } else {
            console.log(`Success! Pool ID: ${pool.id}`);
        }
    }
}

runRateXScraper();
