
async function inspectSerializedDetailed() {
    try {
        const res = await fetch('https://api-n408.onrender.com/api/vaults/serialized');
        const json = await res.json();
        const data = json.data;
        if (Array.isArray(data)) {
            console.log(`Found ${data.length} items in data array.`);
            const first = data[0];
            console.log("Keys in data[0]:", Object.keys(first));
            console.log("Sample object:", JSON.stringify(first, null, 2));
        } else {
            console.log("Data is not an array. Keys:", Object.keys(data || {}));
        }
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}

inspectSerializedDetailed();
