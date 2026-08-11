const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrate_v8.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('Migrasi v8 berhasil — kolom reset password siap.');
  } catch (err) {
    console.error('Migrasi v8 gagal:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
