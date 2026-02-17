const fs = require('fs');

// The improved parseSpectraPools logic from the edge function
function parseSpectraPools(markdown) {
    const pools = [];
    const SPECTRA_CHAINS = {
        1: 'Ethereum', 42161: 'Arbitrum', 10: 'Optimism', 8453: 'Base',
        146: 'Sonic', 43114: 'Avalanche', 56: 'BNB Chain', 14: 'Flare',
        747474: 'Katana', 999: 'HyperEVM',
    };

    const chainSlugToId = {
        'eth': 1, 'ethereum': 1, 'arbitrum': 42161, 'arb': 42161,
        'op': 10, 'optimism': 10, 'base': 8453, 'sonic': 146,
        'avax': 43114, 'avalanche': 43114, 'bsc': 56, 'bnb': 56,
        'flare': 14, 'katana': 747474, 'hyperevm': 999,
    };

    const poolLinkRegex = /\[([^\]]*)\]\(https:\/\/app\.spectra\.finance\/(?:pools|yield|liquidity)\/(\w+)[:/](0x[a-f0-9]+)\)/gi;
    const matches = [...markdown.matchAll(poolLinkRegex)];

    const tokenPatterns = [
        /(vb[A-Z0-9]+)/i, /(st[A-Z0-9]+)/i, /(sav[A-Z0-9]+)/i,
        /(yv[A-Z0-9]+)/i, /(ynETH[\w-/]*)/i, /(sj[A-Z0-9]+)/i,
        /(av[A-Z0-9]+)/i, /(re[A-Z0-9]+)/i, /(hb[A-Z0-9]+)/i,
        /(BOLD|USDN|HYPE|AUSD|USDC|jEUR[x]?|wETH|cbBTC|avax)/i,
    ];

    for (const match of matches) {
        const linkText = match[1];
        const chainSlug = match[2].toLowerCase();
        const poolAddress = match[3];
        const chainId = chainSlugToId[chainSlug] || 1;

        const linkPos = match.index;
        const sectionBefore = markdown.slice(Math.max(0, linkPos - 1500), linkPos);
        const combinedSection = sectionBefore + "\n" + linkText;

        const maxApyPatterns = [
            /Max APY[\s\\n]*([0-9.]+)%/i,
            /([0-9.]+)%[\s\\n]*\+?[\s\\n]*Interest-Bearing/i,
            /APY[\s\\n]*([0-9.]+)%/i,
        ];

        let maxApy = 0;
        for (const pattern of maxApyPatterns) {
            const apyMatch = combinedSection.match(pattern);
            if (apyMatch) {
                maxApy = parseFloat(apyMatch[1]);
                break;
            }
        }

        if (maxApy === 0 || isNaN(maxApy)) continue;

        const liquidityPatterns = [
            /Liquidity[\s\\n]*\$([\d,]+)/i,
            /\$([\d,]+)[\s\\n]*(?:Liquidity|Expiry)/i,
            /\$([\d,]{2,})[\s\\n]*/,
        ];

        let liquidity = 0;
        for (const pattern of liquidityPatterns) {
            const liqMatch = combinedSection.match(pattern);
            if (liqMatch) {
                liquidity = parseInt(liqMatch[1].replace(/,/g, ''));
                break;
            }
        }

        if (liquidity === 0) continue;

        let tokenName = '';
        for (const pattern of tokenPatterns) {
            const tokenMatch = linkText.match(pattern);
            if (tokenMatch) { tokenName = tokenMatch[1]; break; }
        }
        if (!tokenName) {
            const nearSection = markdown.slice(Math.max(0, linkPos - 500), linkPos);
            for (const pattern of tokenPatterns) {
                const tokenMatch = nearSection.match(pattern);
                if (tokenMatch) { tokenName = tokenMatch[1]; break; }
            }
        }

        pools.push({
            name: tokenName || `Pool-${poolAddress.slice(2, 6)}`,
            maxApy,
            liquidity,
            chainId,
            chainName: SPECTRA_CHAINS[chainId],
            poolAddress
        });
    }
    return pools;
}

// Sample markdown from read_url_content
const sampleMarkdown = `
[avUSDAvantMax APY18.41%Interest-Bearing TokenavUSDxLiquidity$2,687,173ExpiryMay 15 2026avUSD - AvantavUSDx](https://app.spectra.finance/pools/avax:0xe9fcba5ad0065ae158d57718ce8f1647f5417688)
[stXRPFirelightMax APY19.29%Interest-Bearing TokenstXRPLiquidity$1,514,413ExpiryMar 05 2026stXRP - FirelightstXRP](https://app.spectra.finance/pools/flare:0xa65a736bcf1f4af7a8f353027218f2d54b3048eb)
[USDNSMARDEXMax APY58.78%Interest-Bearing TokenWUSDNLiquidity$333,328ExpiryJan 12 2027USDN - SMARDEXWUSDN](https://app.spectra.finance/pools/eth:0xd0aad31c66b459a37f306c19c11c7a9b0654c1fa)
`;

const parsed = parseSpectraPools(sampleMarkdown);
console.log(JSON.stringify(parsed, null, 2));
console.log(`Parsed ${parsed.length} pools successfully.`);
