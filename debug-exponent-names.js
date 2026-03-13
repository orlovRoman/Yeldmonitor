
async function debugExponent() {
    console.log("Fetching Exponent Vaults...");
    try {
        const vaultsRes = await fetch('https://api.exponent.finance/api/vaults');
        const vaults = await vaultsRes.json();
        console.log(`Found ${vaults.length} vaults.`);
        
        console.log("Fetching Token Metadata...");
        const tokensRes = await fetch('https://api-n408.onrender.com/api/tokens');
        const tokensDict = await tokensRes.json();
        console.log(`Found metadata for ${Object.keys(tokensDict).length} tokens.`);

        // Pick top 3 vaults to inspect
        for (let i = 0; i < Math.min(5, vaults.length); i++) {
            const vault = vaults[i];
            const syTokenMint = vault.sy_token || vault.underlying_mint;
            const ptMint = vault.pt_mint;
            const syTokenMeta = tokensDict[syTokenMint];
            
            console.log(`\nVault ${i+1}: ${vault.address}`);
            console.log(`SY Mint: ${syTokenMint}`);
            console.log(`PT Mint: ${ptMint}`);
            console.log(`Matched Metadata:`, syTokenMeta || "NOT FOUND");
        }
    } catch (e) {
        console.error("Error debugging:", e);
    }
}

debugExponent();
