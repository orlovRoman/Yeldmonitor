async function testNewApi() {
  console.log("Fetching from https://api.exponent.finance/api/vaults...");
  try {
    const res = await fetch("https://api.exponent.finance/api/vaults", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json"
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    console.log(`Found ${data.length} vaults.`);
    if (data.length > 0) {
      console.log("First vault structure:", JSON.stringify(data[0], null, 2).substring(0, 1000));
    }
  } catch(e) {
    console.error("Error:", e.message);
  }
}
testNewApi();
