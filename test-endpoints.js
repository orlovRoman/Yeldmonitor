const url = "https://wtdfsugadogbrsxoystl.supabase.co/functions/v1/fetch-ratex-markets";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0ZGZzdWdhZG9nYnJzeG95c3RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4MzEwNDYsImV4cCI6MjA4MzQwNzA0Nn0.u0lKLmftO6quqp_iWH8pIFlbUZcH6PTUPiXOKeTsYh0";

async function test(endpoint) {
  console.log(`Testing ${endpoint}...`);
  const res = await fetch(`https://wtdfsugadogbrsxoystl.supabase.co/functions/v1/${endpoint}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "apikey": key,
      "Content-Type": "application/json"
    }
  });
  const text = await res.text();
  console.log(`Status: ${res.status}`);
  console.log(`Body: ${text}`);
}

test("fetch-ratex-markets").then(() => test("fetch-spectra-markets"));
