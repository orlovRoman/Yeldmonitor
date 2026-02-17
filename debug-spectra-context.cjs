const FIRECRAWL_API_KEY = 'fc-974537f1b54042c0bcfe2457b079a47b';

async function scrapeSpectra() {
    console.log('Scraping Spectra (Context Check)...');
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            url: 'https://app.spectra.finance/yield', // Trying /yield as it might be more standard
            formats: ['markdown'],
            onlyMainContent: false,
            waitFor: 15000,
        }),
    });

    const data = await response.json();
    const markdown = data.data.markdown || '';

    // Pattern to find Spectra pool links (flexible)
    const regex = /https:\/\/app\.spectra\.finance\/pools\/\w+[:/][0-9a-fx]+/gi;
    const matches = [...markdown.matchAll(regex)];

    console.log(`Found ${matches.length} pool links.`);

    for (let i = 0; i < Math.min(3, matches.length); i++) {
        const match = matches[i];
        const start = Math.max(0, match.index - 300);
        const end = Math.min(markdown.length, match.index + 300);
        console.log(`--- MATCH ${i + 1} CONTEXT ---`);
        console.log(markdown.substring(start, end));
        console.log(`--- END MATCH ${i + 1} ---`);
    }
}

scrapeSpectra();
