
async function checkTokensApi() {
    const urls = [
        'https://api.exponent.finance/api/tokens',
        'https://api-n408.onrender.com/api/tokens'
    ];
    for (const url of urls) {
        console.log(`\nChecking URL: ${url}`);
        try {
            const res = await fetch(url);
            if (!res.ok) {
                console.log(`Failed: ${res.status}`);
                continue;
            }
            const data = await res.json();
            const keys = Object.keys(data);
            console.log(`Success! Found ${keys.length} tokens.`);
            if (keys.length > 0) {
                console.log(`Sample key: ${keys[0]}`);
                console.log(`Sample data:`, data[keys[0]]);
            }
        } catch (e) {
            console.log(`Error: ${e.message}`);
        }
    }
}

checkTokensApi();
