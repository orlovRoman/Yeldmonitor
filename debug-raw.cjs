async function test() {
    const url = 'https://tkivtvokrnmiimecuowh.supabase.co/functions/v1/fetch-ratex-markets';
    const key = 'sb_publishable_tDQw5og6AZsQ72v3KgCN7g_jwDWP_tj';

    console.log(`Testing raw fetch to ${url}...`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${key}`,
            'apikey': key,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
    });

    console.log('Status:', response.status);
    console.log('Headers:', JSON.stringify([...response.headers.entries()]));
    const text = await response.text();
    console.log('Body:', text);
}

test();
