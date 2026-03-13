
async function testJupPublic() {
    const mint = 'tzqPfHkNpMDxvijpyZihXpjpQ9dzmgDVzgnUcfi3Ubv';
    console.log(`Fetching ${mint} from tokens.jup.ag...`);
    try {
        const res = await fetch(`https://tokens.jup.ag/token/${mint}`);
        if (res.ok) {
            const data = await res.json();
            console.log("Jupiter Public Data:", JSON.stringify(data, null, 2));
        } else {
            console.log("Jupiter Public Error:", res.status);
        }
    } catch (e) {
        console.error("Jupiter Public Fetch Failed:", e);
    }
}

testJupPublic();
