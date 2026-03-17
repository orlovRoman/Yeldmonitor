const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  try {
    await client.query('ALTER TABLE user_telegram_settings ADD COLUMN IF NOT EXISTS notify_implied_increase BOOLEAN DEFAULT true;');
    console.log('Column added successfully');
  } catch (err) {
    console.error('Error adding column:', err);
  } finally {
    await client.end();
  }
}

main();
