const FIRECRAWL_API_KEY = 'fc-974537f1b54042c0bcfe2457b079a47b';

async function scrapeSpectra() {
    console.log('Scraping Spectra (Finding all links)...');
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            url: 'https://app.spectra.finance/pools',
            formats: ['markdown'],
            onlyMainContent: false,
            waitFor: 15000,
        }),
    });

    const data = await response.json();
    const markdown = data.data.markdown || '';

    // Find all pool links - check different patterns
    console.log('\n=== Searching for pool links ===');

    // Pattern 1: Old format
    const oldPattern = /\[([^\]]*)\]\(https:\/\/app\.spectra\.finance\/(?:pools|yield|liquidity)\/(\w+)[:/](0x[a-f0-9]+)\)/gi;
    const oldMatches = [...markdown.matchAll(oldPattern)];
    console.log(`Old format matches: ${oldMatches.length}`);

    // Pattern 2: Any spectra.finance links
    const anyPattern = /https:\/\/app\.spectra\.finance\/[^\s\)]+/gi;
    const anyMatches = [...markdown.matchAll(anyPattern)];
    console.log(`Any spectra links: ${anyMatches.length}`);

    // Print first 10 links found
    console.log('\nFirst 10 links:');
    anyMatches.slice(0, 10).forEach((m, i) => {
        console.log(`${i + 1}. ${m[0]}`);
    });

    // Check if there are links with pool addresses (0x...)
    const poolAddrPattern = /spectra\.finance\/[^\s]*0x[a-f0-9]+/gi;
    const poolAddrMatches = [...markdown.matchAll(poolAddrPattern)];
    console.log(`\nLinks with pool addresses: ${poolAddrMatches.length}`);
    poolAddrMatches.slice(0, 5).forEach((m, i) => {
        console.log(`${i + 1}. ${m[0]}`);
    });
}

scrapeSpectra();
