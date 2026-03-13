
async function debugExponentLiquidityFixed() {
  try {
    console.log("Fetching Exponent Vaults...");
    const vaultsRes = await fetch('https://api.exponent.finance/api/vaults');
    const vaults = await vaultsRes.json();
    
    console.log("Fetching Exponent Tokens...");
    const tokensRes = await fetch('https://api.exponent.finance/api/tokens');
    const tokensList = await tokensRes.json();
    
    const tokensDict = {};
    for (const t of tokensList) {
      if (t.mint) tokensDict[t.mint.trim()] = t;
    }

    console.log("\nVaults inspection (2026):");
    const targetExpiries = ['2026-05-13', '2026-06-04', '2026-07-08', '2026-05-12', '2026-04-27'];
    
    const targetVaults = vaults.filter(v => {
      const expiry = v.end_timestamp ? v.end_timestamp.substring(0, 10) : '';
      return targetExpiries.includes(expiry);
    });

    console.log(`Found ${targetVaults.length} target vaults matching expiries.`);

    for (const v of targetVaults) {
      const syTokenMint = (v.sy_token || v.underlying_mint || '').trim();
      const ptMint = (v.pt_mint || '').trim();
      const syMeta = tokensDict[syTokenMint];
      const ptMeta = tokensDict[ptMint];
      
      console.log(`\n--- Vault: ${v.address} ---`);
      console.log(`Expiry: ${v.end_timestamp}`);
      console.log(`SY Mint: ${syTokenMint}`);
      console.log(`SY Meta Found: ${!!syMeta}`);
      if (syMeta) {
          console.log(`SY Name: ${syMeta.name}, Decimals: ${syMeta.decimals}, Price: ${syMeta.priceUsd}`);
      } else {
          // Check if it's in the other API
          console.log("SY Meta NOT FOUND in tokens API.");
      }
      
      console.log(`PT Mint: ${ptMint}`);
      console.log(`PT Meta Found: ${!!ptMeta}`);
      if (ptMeta) console.log(`PT Name: ${ptMeta.name}, Decimals: ${ptMeta.decimals}`);

      console.log(`legacy_tvl_in_base_token: ${v.legacy_tvl_in_base_token}`);
      console.log(`pt_supply: ${v.pt_supply}`);
    }
  } catch (e) {
    console.error("Debug failed:", e);
  }
}

debugExponentLiquidityFixed();
