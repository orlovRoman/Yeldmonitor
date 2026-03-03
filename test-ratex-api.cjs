const https = require('https');

const data = JSON.stringify({
    serverName: "AdminSvr",
    method: "querySymbol",
    content: { cid: "test-" + Date.now() }
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
        try {
            const json = JSON.parse(body);
            console.log('Response code:', json.code);
            if (json.data && json.data.symbols) {
                console.log('Found nested symbols array');
                const xsol = json.data.symbols.find(s => s.symbol === 'xSOL-2604');
                if (xsol) {
                    console.log('\nxSOL-2604 data:');
                    console.log('  sum_price:', xsol.sum_price);
                    console.log('  initial_upper_yield_range:', xsol.initial_upper_yield_range);
                    console.log('  initial_lower_yield_range:', xsol.initial_lower_yield_range);
                    console.log('  symbol_name:', xsol.symbol_name);
                }
            } else if (Array.isArray(json.data)) {
                console.log('Found direct array');
                const xsol = json.data.find(s => s.symbol === 'xSOL-2604');
                if (xsol) {
                    console.log('\nxSOL-2604 data:');
                    console.log('  sum_price:', xsol.sum_price);
                    console.log('  initial_upper_yield_range:', xsol.initial_upper_yield_range);
                    console.log('  initial_lower_yield_range:', xsol.initial_lower_yield_range);
                }
            } else {
                console.log('Response structure:', Object.keys(json));
                console.log('First 500 chars:', body.substring(0, 500));
            }
        } catch (e) {
            console.error('Parse error:', e.message);
            console.log('Response:', body.substring(0, 500));
        }
    });
});

req.on('error', (e) => console.error('Request error:', e));
req.write(data);
req.end();
