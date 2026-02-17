const https = require('https');

const data = JSON.stringify({
    serverName: "AdminSvr",
    method: "querySymbol",
    content: { cid: "test-123" }
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
            const symbols = json.data?.symbols || json.data;
            if (Array.isArray(symbols)) {
                const xsol = symbols.find(s => s.symbol === 'xSOL-2604');
                if (xsol) {
                    console.log('xSOL-2604 full data:');
                    console.log(JSON.stringify(xsol, null, 2));
                } else {
                    console.log('xSOL-2604 not found');
                }
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
