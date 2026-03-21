import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' }); // Load env from root or local .env

const { Pool } = pg;

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
});

async function applyMigration() {
  const migrationPath = path.join(process.cwd(), '../supabase/migrations/20250602000000_automations.sql');
  console.log(`Reading migration file from: ${migrationPath}`);

  try {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log('Executing SQL...');
    await pool.query(sql);
    console.log('Migration applied successfully.');
  } catch (error) {
    console.error('Error applying migration:', error);
  } finally {
    await pool.end();
  }
}

applyMigration();
