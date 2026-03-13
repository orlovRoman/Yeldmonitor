// Debug: check Spectra __NEXT_DATA__ structure for TVL
const https = require('https');

const url = 'https://app.spectra.finance/trade-yield';

const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' } }, (res) => {
    let html = '';
    res.on('data', chunk => html += chunk);
    res.on('end', () => {
        const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (!m) { console.log('NO __NEXT_DATA__ found'); return; }

        const nd = JSON.parse(m[1]);
        const queries = nd?.props?.pageProps?.dehydratedState?.queries || [];

        for (const q of queries) {
            const data = q?.state?.data;
            if (Array.isArray(data) && data.length > 3) {
                // Check first 3 parent items
                for (let i = 0; i < Math.min(3, data.length); i++) {
                    const item = data[i];
                    console.log(`\n=== PARENT[${i}] name=${item.name || '?'} ===`);
                    console.log('  Parent tvl:', JSON.stringify(item.tvl));
                    console.log('  Parent underlying:', item.underlying?.symbol);

                    if (item.pools && item.pools.length > 0) {
                        for (let j = 0; j < Math.min(2, item.pools.length); j++) {
                            const pool = item.pools[j];
                            console.log(`  --- CHILD POOL[${j}] name=${pool.name || '?'} ---`);
                            console.log('    Pool tvl:', JSON.stringify(pool.tvl));
                            console.log('    Pool keys:', Object.keys(pool).join(', '));
                        }
                    }
                }
                break;
            }
        }
    });
});

req.on('error', e => console.error('Error:', e.message));
req.setTimeout(15000, () => { console.log('Timeout'); req.destroy(); });
