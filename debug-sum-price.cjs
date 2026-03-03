const https = require('https');

function callApi(method) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            serverName: 'AdminSvr',
            method,
            content: { cid: 'dbg-' + Date.now() }
        });
        const options = {
            hostname: 'api.rate-x.io', port: 443, path: '/', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
        };
        const req = https.request(options, res => {
            let b = '';
            res.on('data', c => b += c);
            res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function main() {
    const r = await callApi('querySymbol');
    const items = Array.isArray(r.data) ? r.data : (r.data?.symbols || r.data?.list || []);
    const now = new Date();

    const targets = ['sUSDu-2603', 'xSOL-2604', 'HYLOSOLPLUS-2604', 'FRAGBTCV2-2606'];

    for (const sym of targets) {
        const m = items.find(s => s.symbol === sym);
        if (!m) { console.log(`${sym}: NOT FOUND`); continue; }

        const due = new Date(m.due_date?.replace(' 24:00:00', ' 23:59:59') || '');
        const days = (due - now) / (1000 * 60 * 60 * 24);
        const impliedFromPrice = m.sum_price > 0 && days > 0 ? m.sum_price * 365 / days : 0;

        console.log(`\n${sym}:`);
        console.log(`  sum_price = ${m.sum_price}`);
        console.log(`  due_date = ${m.due_date} → ${days.toFixed(1)} days left`);
        console.log(`  initial_upper_yield_range = ${m.initial_upper_yield_range}`);
        console.log(`  initial_lower_yield_range = ${m.initial_lower_yield_range}`);
        console.log(`  => implied from price formula: ${(impliedFromPrice * 100).toFixed(3)}%`);
        console.log(`  => implied from upper_range:   ${(m.initial_upper_yield_range / 100).toFixed(3)}`);
    }

    // Also check querySolanaTermRewardRate for comparison
    console.log('\n=== querySolanaTermRewardRate ===');
    const r2 = await callApi('querySolanaTermRewardRate');
    const stats = Array.isArray(r2.data) ? r2.data : [];
    for (const sym of ['sUSDu-2603', 'xSOL-2604']) {
        const entries = stats.filter(s => s.symbol === sym);
        if (entries.length) {
            console.log(`\n${sym} stats:`, JSON.stringify(entries[0]));
        }
    }
}

main().catch(console.error);
