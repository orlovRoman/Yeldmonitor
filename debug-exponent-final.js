
async function debugExponentFinal() {
    try {
        console.log("Fetching Exponent Vaults...");
        const vaultsRes = await fetch('https://api.exponent.finance/api/vaults');
        const vaults = await vaultsRes.json();
        
        console.log("Fetching Exponent Tokens...");
        const tokensRes = await fetch('https://api.exponent.finance/api/tokens');
        const tokensList = await tokensRes.json();
        
        console.log(`Type: ${Array.isArray(tokensList) ? 'Array' : typeof tokensList}`);
        console.log(`Length: ${tokensList.length}`);

        const tokensDict = {};
        for (const t of tokensList) {
            if (t.mint) tokensDict[t.mint.trim()] = t;
        }

        const sampleVault = vaults.find(v => v.sy_token === 'tzqPfHkNpMDxvijpyZihXpjpQ9dzmgDVzgnUcfi3Ubv');
        if (sampleVault) {
            console.log("\nFound Maple Syrup USDC Vault:");
            console.log("SY Token in Vault:", `'${sampleVault.sy_token}'`);
            const matched = tokensDict[sampleVault.sy_token.trim()];
            console.log("Matched in Dict:", matched ? matched.name : "NOT FOUND");
        } else {
            console.log("\nMaple Syrup USDC Vault not found in vaults list!");
        }

        // Print first 5 tokens in dict for inspection
        console.log("\nFirst 5 tokens in dict:");
        Object.keys(tokensDict).slice(0, 5).forEach(m => console.log(`- ${m}: ${tokensDict[m].name}`));

    } catch (e) {
        console.error("Debug failed:", e);
    }
}

debugExponentFinal();
