
async function logAllExpiries() {
  try {
    const vaultsRes = await fetch('https://api.exponent.finance/api/vaults');
    const vaults = await vaultsRes.json();
    console.log("Unique Expiries in API:");
    const expiries = [...new Set(vaults.map(v => v.end_timestamp ? v.end_timestamp.substring(0, 10) : 'null'))];
    console.log(expiries.sort());
    
    console.log("\nSample vault from API:");
    console.log(JSON.stringify(vaults[0], null, 2));

    console.log("\nChecking for any 'tzq' token in vaults...");
    const mapleSyrup = vaults.find(v => (v.sy_token || '').includes('tzq') || (v.pt_mint || '').includes('tzq'));
    if (mapleSyrup) {
      console.log("Found Maple Syrup Vault:", mapleSyrup.address);
      console.log("end_timestamp:", mapleSyrup.end_timestamp);
    }
  } catch (e) {
    console.error(e);
  }
}
logAllExpiries();
