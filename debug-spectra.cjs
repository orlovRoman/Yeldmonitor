const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

async function checkSpectra() {
    console.log('Checking Spectra pools...');
    const { data: pools, error: poolsError } = await supabase
        .from('pendle_pools')
        .select('*')
        .ilike('name', '%[Spectra]%')
        .order('updated_at', { ascending: false });

    if (poolsError) {
        console.error('Error fetching pools:', poolsError);
        return;
    }

    console.log(`Found ${pools.length} Spectra pools.`);
    if (pools.length > 0) {
        console.log('Latest 5 Spectra pools:');
        pools.slice(0, 5).forEach(p => {
            console.log(`- ${p.name} (ID: ${p.id}, Chain: ${p.chain_id}, Updated: ${p.updated_at})`);
        });

        const poolIds = pools.slice(0, 10).map(p => p.id);
        const { data: rates, error: ratesError } = await supabase
            .from('pendle_rates_history')
            .select('*')
            .in('pool_id', poolIds)
            .order('recorded_at', { ascending: false })
            .limit(20);

        if (ratesError) {
            console.error('Error fetching rates:', ratesError);
        } else {
            console.log(`\nLatest 20 rates for top 10 Spectra pools:`);
            rates.forEach(r => {
                const pool = pools.find(p => p.id === r.pool_id);
                console.log(`- ${pool?.name || r.pool_id}: APY=${(r.implied_apy * 100).toFixed(2)}%, Liq=${r.liquidity}, Time=${r.recorded_at}`);
            });
        }

        const { data: alerts, error: alertsError } = await supabase
            .from('pendle_alerts')
            .select('*')
            .in('pool_id', pools.map(p => p.id))
            .order('created_at', { ascending: false })
            .limit(10);

        if (alertsError) {
            console.error('Error fetching alerts:', alertsError);
        } else {
            console.log(`\nLatest 10 Spectra alerts:`);
            alerts.forEach(a => {
                const pool = pools.find(p => p.id === a.pool_id);
                console.log(`- ${pool?.name || a.pool_id}: Type=${a.alert_type}, Change=${a.change_percent}%, Time=${a.created_at}`);
            });
        }
    }
}

checkSpectra();
