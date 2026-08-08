const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrate_v4.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('Migrasi v4 berhasil — kolom role (penjual/pembeli) siap.');
  } catch (err) {
    console.error('Migrasi v4 gagal:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
