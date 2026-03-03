const https = require('https');

function callApi(method, params = {}) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            serverName: "AdminSvr",
            method,
            content: { cid: `debug-${Date.now()}`, ...params }
        });

        const options = {
            hostname: 'api.rate-x.io',
            port: 443,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length,
                'Accept': '*/*',
                'Origin': 'https://app.rate-x.io',
                'Referer': 'https://app.rate-x.io/'
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(e); }
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function main() {
    console.log('\n=== querySolanaTermRewardRate ===');
    const statsResult = await callApi('querySolanaTermRewardRate');
    const stats = Array.isArray(statsResult.data) ? statsResult.data : [];
    console.log(`Total entries: ${stats.length}`);

    // Find sUSDu and xSOL entries
    const targets = ['sUSDu-2603', 'xSOL-2604', 'ONyc-2605'];
    for (const sym of targets) {
        const entries = stats.filter(s => s.symbol === sym);
        if (entries.length > 0) {
            console.log(`\n${sym} entries:`);
            entries.forEach(e => console.log(JSON.stringify(e, null, 2)));
        } else {
            console.log(`\n${sym}: NOT FOUND in stats`);
        }
    }

    console.log('\n=== querySymbol (first entry with initial_upper_yield_range) ===');
    const symbolResult = await callApi('querySymbol');
    const symbols = Array.isArray(symbolResult.data) ? symbolResult.data : [];
    console.log(`Total symbols: ${symbols.length}`);
    for (const sym of targets) {
        const entry = symbols.find(s => s.symbol === sym);
        if (entry) {
            console.log(`\n${sym}:`, JSON.stringify({
                symbol: entry.symbol,
                initial_lower_yield_range: entry.initial_lower_yield_range,
                initial_upper_yield_range: entry.initial_upper_yield_range,
                earn_w: entry.earn_w,
            }, null, 2));
        } else {
            console.log(`\n${sym}: NOT FOUND in querySymbol`);
        }
    }
}

main().catch(console.error);
