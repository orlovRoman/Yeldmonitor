const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const dbUrl = "postgres://postgres.tkivtvokrnmiimecuowh:198320196606@aws-0-us-east-1.pooler.supabase.com:5432/postgres"; // Session mode URL from earlier tests

async function runMigrations() {
  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    console.log("Connected to Supabase DB!");

    const migrationsDir = path.join(__dirname, 'supabase', 'migrations');
    const files = [
      '20260313143746_telegram_alerts_settings.sql'
    ];

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      if (fs.existsSync(filePath)) {
        console.log(`Executing ${file}...`);
        const sql = fs.readFileSync(filePath, 'utf8');
        await client.query(sql);
        console.log(`Successfully executed ${file}`);
      } else {
        console.error(`File not found: ${file}`);
      }
    }

  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await client.end();
  }
}

runMigrations();
