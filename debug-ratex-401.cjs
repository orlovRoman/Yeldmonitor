const { createClient } = require('@supabase/supabase-js');

const url = 'https://tkivtvokrnmiimecuowh.supabase.co';
const key = 'sb_publishable_tDQw5og6AZsQ72v3KgCN7g_jwDWP_tj';

const supabase = createClient(url, key);

async function test() {
    console.log('Invoking fetch-ratex-markets...');
    try {
        const { data, error } = await supabase.functions.invoke('fetch-ratex-markets');
        console.log('Result Data:', data);
        if (error) {
            console.log('Result Error:', error);
            if (error.context) {
                console.log('Error Context Status:', error.context.status);
            }
        }
    } catch (err) {
        console.error('Caught Exception:', err);
    }
}

test();
