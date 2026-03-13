// Additional API check to get token symbols
async function testTokens() {
  console.log("Fetching tokens...");
  const res = await fetch("https://api-n408.onrender.com/api/tokens");
  const data = await res.json();
  console.log("Tokens example:");
  const example = Object.keys(data).slice(0, 3).reduce((acc, k) => { acc[k] = data[k]; return acc; }, {});
  console.log(JSON.stringify(example, null, 2));
}
testTokens();
