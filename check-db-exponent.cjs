
const { createClient } = require('@supabase/supabase-js');

async function checkDb() {
    const supabase = createClient(
        'https://tkivtvokrnmiimecuowh.supabase.co',
        process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    const { data, error } = await supabase
        .from('pendle_pools')
        .select('name, market_address')
        .like('market_address', 'exponent-%')
        .limit(10);

    if (error) {
        console.error("DB Error:", error);
    } else {
        console.log("Exponent Pools in DB:");
        console.log(JSON.stringify(data, null, 2));
    }
}

checkDb();
