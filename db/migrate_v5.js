const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrate_v5.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('Migrasi v5 berhasil — tabel conversations & messages siap.');
  } catch (err) {
    console.error('Migrasi v5 gagal:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
