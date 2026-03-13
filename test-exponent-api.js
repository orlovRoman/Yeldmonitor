async function checkApi() {
  try {
    const res = await fetch("https://api.exponent.fi/api/pools");
    const data = await res.json();
    console.log(`Found ${data.length || Object.keys(data).length} items`);
    console.log(JSON.stringify(data).substring(0, 500));
  } catch(e) {
    console.log("Error:", e.message);
  }
}
checkApi();
