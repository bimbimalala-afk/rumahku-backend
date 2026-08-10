const pool = require('./pool');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE listings
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT
    `);

    await client.query(`
      UPDATE listings SET status = 'active' WHERE status IS NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status)
    `);

    await client.query('COMMIT');
    console.log('✅ Migration v8 berhasil');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', err);
  } finally {
    client.release();
  }
}

migrate();
