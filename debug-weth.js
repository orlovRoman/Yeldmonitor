async function debugSpectra() {
    const response = await fetch('https://app.spectra.finance/trade-yield', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html',
        },
    });

    const html = await response.text();
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!nextDataMatch) throw new Error('No __NEXT_DATA__');

    const nextData = JSON.parse(nextDataMatch[1]);
    const queries = nextData?.props?.pageProps?.dehydratedState?.queries || [];

    let allPools = [];
    for (const query of queries) {
        const data = query?.state?.data;
        if (Array.isArray(data) && data.length > 3) {
            for (const item of data) {
                const parentUnderlying = item.underlying?.symbol || '';
                const parentIbt = item.ibt?.symbol || '';
                if (item.pools && Array.isArray(item.pools)) {
                    for (const pool of item.pools) {
                        pool._parentUnderlying = parentUnderlying;
                        pool._parentIbt = parentIbt;
                    }
                    allPools.push(...item.pools);
                } else if (item.address && (item.impliedApy !== undefined || item.ptApy !== undefined)) {
                    item._parentUnderlying = parentUnderlying;
                    item._parentIbt = parentIbt;
                    allPools.push(item);
                }
            }
        }
    }

    const wethPools = allPools.filter(p => JSON.stringify(p).toLowerCase().includes('weth.e') || JSON.stringify(p).toLowerCase().includes('weth'));
    console.log('Total pools found in page:', allPools.length);

    const avaxPools = allPools.filter(p => p.chainId === 43114);
    console.log('Avalanche pools found:', avaxPools.length);
    if (avaxPools.length > 0) {
        console.log(JSON.stringify(avaxPools, null, 2));
    } else {
        console.log('No Avalanche pools found. WETH.e pools overall:');
        console.log(wethPools.map(p => ({ chainId: p.chainId, address: p.address, name: p.name, underlying: p._parentUnderlying, ibt: p._parentIbt })));
    }
}

debugSpectra().catch(console.error);
