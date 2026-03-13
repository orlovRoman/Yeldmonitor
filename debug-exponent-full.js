
async function debugExponentFull() {
    try {
        const vaultsRes = await fetch('https://api.exponent.finance/api/vaults');
        const vaults = await vaultsRes.json();
        console.log(JSON.stringify(vaults[0], null, 2));
    } catch (e) {
        console.error("Error debugging:", e);
    }
}

debugExponentFull();
