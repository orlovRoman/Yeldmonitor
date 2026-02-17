const FIRECRAWL_API_KEY = 'fc-974537f1b54042c0bcfe2457b079a47b';

async function scrapeSpectra() {
    console.log('Scraping Spectra (Full)...');
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

    // Find first pool link
    const searchStr = 'https://app.spectra.finance/pools/';
    const index = markdown.indexOf(searchStr);
    if (index !== -1) {
        console.log('--- MARKDOWN AROUND FIRST LINK ---');
        console.log(markdown.substring(index - 500, index + 500));
        console.log('--- END ---');
    } else {
        console.log('No pool links found with that prefix.');
        console.log('Markdown start:', markdown.substring(0, 1000));
    }
}

scrapeSpectra();
