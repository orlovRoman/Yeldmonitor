
async function debugExponentDeep() {
    try {
        console.log("Fetching Exponent Vaults...");
        const vaultsRes = await fetch('https://api.exponent.finance/api/vaults');
        const vaults = await vaultsRes.json();
        console.log(`Found ${vaults.length} vaults.`);
        
        console.log("Fetching Exponent Tokens...");
        const tokensRes = await fetch('https://api.exponent.finance/api/tokens');
        const tokensList = await tokensRes.json();
        console.log(`Found ${tokensList.length} tokens in official API.`);

        const tokensDict = {};
        if (Array.isArray(tokensList)) {
            for (const token of tokensList) {
                if (token.mint) {
                    tokensDict[token.mint] = token;
                }
            }
        }
        console.log(`Dictionary created with ${Object.keys(tokensDict).length} entries.`);

        const unknownVaults = [];
        
        for (const vault of vaults) {
            const syTokenMint = vault.sy_token || vault.underlying_mint;
            const ptMint = vault.pt_mint;
            
            const syTokenMeta = tokensDict[syTokenMint];
            const ptTokenMeta = tokensDict[ptMint];
            
            const tokenName = syTokenMeta?.name || syTokenMeta?.ticker || ptTokenMeta?.name || ptTokenMeta?.ticker || "Unknown";
            
            if (tokenName === "Unknown") {
                unknownVaults.push({
                    address: vault.address,
                    sy_token: syTokenMint,
                    pt_mint: ptMint
                });
            }
        }

        console.log(`\nFound ${unknownVaults.length} vaults that still result in 'Unknown'.`);
        if (unknownVaults.length > 0) {
            console.log("Sample unknown vaults:", JSON.stringify(unknownVaults.slice(0, 3), null, 2));
            
            // Check if these mints exist in the tokens list ANYWHERE but under a different key
            const sampleMint = unknownVaults[0].sy_token;
            console.log(`\nSearching for sample mint ${sampleMint} in tokensList...`);
            const foundAnywhere = tokensList.find(t => Object.values(t).includes(sampleMint));
            if (foundAnywhere) {
                console.log("Found sample mint in tokensList but not in 'mint' property! Full token object:", foundAnywhere);
            } else {
                console.log("Sample mint not found in tokensList at all.");
            }
        }

    } catch (e) {
        console.error("Debug failed:", e);
    }
}

debugExponentDeep();
