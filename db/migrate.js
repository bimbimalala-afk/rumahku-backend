const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await pool.query(schema);
    console.log('Migrasi berhasil — tabel users, listings, listing_photos siap.');
  } catch (err) {
    console.error('Migrasi gagal:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
