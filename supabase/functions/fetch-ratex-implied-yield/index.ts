const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RATEX_API_URL = 'https://api.rate-x.io/';

function generateCid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

async function callRateXApi<T>(
    serverName: 'AdminSvr' | 'MDSvr' | 'APSSvr',
    method: string,
    content: Record<string, unknown> = {}
): Promise<{ code: number; msg: string; data: T }> {
    const payload = {
        serverName,
        method,
        content: { cid: generateCid(), ...content },
    };
    const response = await fetch(RATEX_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0',
            'Origin': 'https://app.rate-x.io',
            'Referer': 'https://app.rate-x.io/',
        },
        body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`RateX HTTP ${response.status}`);
    return response.json();
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // Parse optional symbol filter from body
        let filterSymbols: string[] = [];
        try {
            const body = await req.json();
            filterSymbols = body?.symbols || [];
        } catch { /* no body — return all active */ }

        console.log('[RateX API] Fetching all live data via MDSvr.queryTrade...');

        // === 1. Live yield + market data from MDSvr ===
        const tradeRes = await callRateXApi<any[]>('MDSvr', 'queryTrade');
        const tradeEntries: any[] = Array.isArray(tradeRes.data) ? tradeRes.data : [];
        console.log(`[RateX API] queryTrade: ${tradeEntries.length} entries`);

        // Build index by SecurityID
        const tradeMap: Record<string, any> = {};
        for (const t of tradeEntries) {
            if (t.SecurityID) tradeMap[t.SecurityID] = t;
        }

        // === 2. Symbol metadata (for expiry, categories, earn_margin_index) ===
        const symbolRes = await callRateXApi<any>('AdminSvr', 'querySymbol');
        let symbols: any[] = [];
        if (Array.isArray(symbolRes.data)) {
            symbols = symbolRes.data;
        } else if (symbolRes.data?.symbols) {
            symbols = symbolRes.data.symbols;
        }
        console.log(`[RateX API] querySymbol: ${symbols.length} symbols`);

        // === 3. Underlying APY via dc.aps.referenceprice (keyed by category name) ===
        const refPriceMap: Record<string, number> = {};
        try {
            const refRes = await callRateXApi<Record<string, any>>('APSSvr', 'dc.aps.referenceprice');
            if (refRes.data && typeof refRes.data === 'object') {
                for (const [category, periods] of Object.entries(refRes.data)) {
                    const p = periods as Record<string, string>;
                    // Prefer 7D period, fallback to 1M, 1Y, ON
                    const val = parseFloat(p['7D'] ?? p['1M'] ?? p['1Y'] ?? p['ON'] ?? '0');
                    if (!isNaN(val) && val > 0) {
                        // referenceprice values are already in decimal format (0.08 = 8%)
                        refPriceMap[category.toUpperCase()] = val;
                        refPriceMap[category] = val;
                    }
                }
            }
            console.log(`[RateX API] referenceprice: ${Object.keys(refPriceMap).length / 2} categories`);
        } catch (e) {
            console.warn('[RateX API] referenceprice failed:', e);
        }

        // === 4. Underlying APY via queryBaseApy (per-symbol, values are PERCENTAGES e.g. 15.1 = 15.1%) ===
        const baseApyMap: Record<string, number> = {};
        try {
            const baseRes = await callRateXApi<Record<string, string>>('AdminSvr', 'queryBaseApy');
            if (baseRes.data && typeof baseRes.data === 'object') {
                for (const [sym, val] of Object.entries(baseRes.data)) {
                    const parsed = parseFloat(val as string);
                    // queryBaseApy returns PERCENTAGE values (e.g. 15.098 = 15.098%, divide by 100 for decimal)
                    if (!isNaN(parsed) && parsed > 0) {
                        baseApyMap[sym] = parsed / 100; // Convert to decimal: 15.098 → 0.15098
                    }
                }
            }
            console.log(`[RateX API] queryBaseApy: ${Object.keys(baseApyMap).length} entries`);
        } catch (e) {
            console.warn('[RateX API] queryBaseApy failed:', e);
        }

        // === 5. Build results ===
        const now = new Date();
        const activeSymbols = symbols.filter(s => {
            if (s.is_delete === '1') return false;
            if (!s.due_date) return true;
            const due = new Date(s.due_date.replace(' 24:00:00', ' 23:59:59'));
            return due > now;
        });

        const results: any[] = [];

        for (const sym of activeSymbols) {
            const id = sym.symbol as string;
            if (filterSymbols.length > 0 && !filterSymbols.includes(id)) continue;

            const trade = tradeMap[id];
            if (!trade) continue; // No live data for this symbol — skip

            // Implied Yield: from MDSvr (Yield field is already a decimal, e.g. 0.17563 = 17.563%)
            const impliedYield = parseFloat(trade.Yield || '0');

            // MarkPrice: price of 1 YT token
            const markPrice = parseFloat(trade.MarkPrice || '0');

            // Yield Exposure: 1 / MarkPrice (e.g. 1/0.01233 = 81.1x)
            const yieldExposure = markPrice > 0 ? 1 / markPrice : 0;

            // TTM: days to maturity
            const ttm = parseInt(trade.TTM || '0', 10);

            // Open Interest & Liquidity
            const openInterest = parseFloat(trade.OpenInterest || '0');
            const avaLiquidity = parseFloat(trade.AvaLiquidity || '0');

            // Underlying APY: prefer referenceprice by exact symbol key, then by category, fallback queryBaseApy
            // referenceprice is keyed by category (e.g. 'PSTV2', 'sUSDu', 'sHYUSD', 'ONyc')
            // queryBaseApy is keyed by full symbol (e.g. 'xSOL-2604') but values are % → divide by 100
            const categoryUpper = (sym.symbol_level1_category || '').toUpperCase();
            const categoryOrig = sym.symbol_level1_category || '';
            let underlyingApy =
                refPriceMap[categoryOrig] ??
                refPriceMap[categoryUpper] ??
                baseApyMap[id] ??
                0;

            results.push({
                symbol: id,
                symbolName: sym.symbol_name || id,
                category: sym.symbol_level1_category || '',
                dueDate: sym.due_date || null,
                ttmDays: ttm,
                impliedYield,          // decimal: 0.17563 = 17.563%
                impliedYieldPct: (impliedYield * 100).toFixed(3) + '%',
                underlyingApy,         // decimal: 0.08 = 8%
                underlyingApyPct: (underlyingApy * 100).toFixed(3) + '%',
                markPrice,
                yieldExposure: parseFloat(yieldExposure.toFixed(2)),
                yieldExposureStr: yieldExposure.toFixed(2) + 'x',
                openInterest,
                avaLiquidity,
                timestamp: new Date().toISOString(),
            });
        }

        console.log(`[RateX API] Returning ${results.length} results`);

        return new Response(
            JSON.stringify({
                success: true,
                total: results.length,
                data: results,
                sources: {
                    liveYield: 'MDSvr.queryTrade',
                    underlyingApy: 'APSSvr.dc.aps.referenceprice + AdminSvr.queryBaseApy',
                    metadata: 'AdminSvr.querySymbol',
                },
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[RateX API] Error:', msg);
        return new Response(
            JSON.stringify({ success: false, error: msg }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
