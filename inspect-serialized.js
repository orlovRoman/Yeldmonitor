
async function inspectSerializedVaults() {
    try {
        console.log("Fetching Serialized Vaults...");
        const res = await fetch('https://api-n408.onrender.com/api/vaults/serialized');
        const vaults = await res.json();
        console.log(`Found ${vaults.length} serialized vaults.`);
        if (vaults.length > 0) {
            const first = vaults[0];
            console.log("Sample Serialized Vault keys:", Object.keys(first));
            // Check for names or identifying info
            console.log("Sample object (first 20 lines):", JSON.stringify(first, null, 2).split('\n').slice(0, 20).join('\n'));
        }

        // Try to fetch tokens with a modern User-Agent
        console.log("\nFetching Tokens with User-Agent...");
        const tokensRes = await fetch('https://api.exponent.finance/api/tokens', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const tokens = await tokensRes.json();
        console.log(`Found ${tokens.length} tokens.`);

    } catch (e) {
        console.error("Inspect failed:", e);
    }
}

inspectSerializedVaults();
