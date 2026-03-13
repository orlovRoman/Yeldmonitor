const testUrl = "https://tkivtvokrnmiimecuowh.supabase.co/functions/v1/fetch-exponent-markets";
async function test() {
  console.log(`Testing POST to tkivtvokrnmiimecuowh for EXPONENT...`);
  const res = await fetch(testUrl, { method: "POST" });
  console.log(`Status: ${res.status}`);
  const text = await res.text();
  console.log(`Body:`, text);
}
test();
