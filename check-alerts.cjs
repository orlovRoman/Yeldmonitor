const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.from('pendle_alerts').select('*').order('created_at', { ascending: false }).limit(5);
  if (error) {
    console.error('Error:', error);
    return;
  }
  console.log(data);
}
check();
