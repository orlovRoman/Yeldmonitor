const testUrl = "https://tkivtvokrnmiimecuowh.supabase.co/functions/v1/fetch-ratex-markets";
async function test() {
  console.log(`Testing POST to tkivtvokrnmiimecuowh...`);
  const res = await fetch(testUrl, { method: "POST" });
  console.log(`Status: ${res.status}`);
  const text = await res.text();
  console.log(`Body:`, text);
}
test();
