
async function testJupiter() {
    const mint = 'tzqPfHkNpMDxvijpyZihXpjpQ9dzmgDVzgnUcfi3Ubv';
    console.log(`Fetching ${mint} from Jupiter...`);
    try {
        const res = await fetch(`https://api.jup.ag/tokens/v1/token/${mint}`);
        if (res.ok) {
            const data = await res.json();
            console.log("Jupiter Data:", JSON.stringify(data, null, 2));
        } else {
            console.log("Jupiter Error:", res.status);
        }
    } catch (e) {
        console.error("Jupiter Fetch Failed:", e);
    }

    console.log("\nInspecting Serialized Vaults response type...");
    try {
        const res = await fetch('https://api-n408.onrender.com/api/vaults/serialized');
        const data = await res.json();
        console.log("Data Type:", typeof data);
        if (data && typeof data === 'object') {
            console.log("Top level keys:", Object.keys(data));
            if (data.vaults) {
                console.log("Vaults array length:", data.vaults.length);
            }
        }
    } catch (e) {
        console.error("Vaults fetch failed:", e);
    }
}

testJupiter();
