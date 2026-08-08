const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrate_v3.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('Migrasi v3 berhasil — index performa sudah dibuat.');
  } catch (err) {
    console.error('Migrasi v3 gagal:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
