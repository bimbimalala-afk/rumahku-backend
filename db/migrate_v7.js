const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrate_v7.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('Migrasi v7 berhasil — kolom verifikasi akun siap.');
  } catch (err) {
    console.error('Migrasi v7 gagal:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
