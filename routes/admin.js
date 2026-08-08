const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { clearListingsCache } = require('../middleware/cache');

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get('/listings', async (req, res) => {
  const status = req.query.status || 'pending_review';
  try {
    const result = await pool.query(
      `SELECT l.*, u.name AS owner_name, u.email AS owner_email, u.whatsapp AS owner_whatsapp
       FROM listings l JOIN users u ON u.id = l.user_id
       WHERE l.status = $1
       ORDER BY l.created_at ASC`,
      [status]
    );
    const ids = result.rows.map((l) => l.id);
    let photosByListing = {};
    if (ids.length > 0) {
      const photos = await pool.query('SELECT * FROM listing_photos WHERE listing_id = ANY($1)', [ids]);
      photos.rows.forEach((p) => {
        photosByListing[p.listing_id] = photosByListing[p.listing_id] || [];
        photosByListing[p.listing_id].push(p);
      });
    }
    const listings = result.rows.map((l) => ({ ...l, photos: photosByListing[l.id] || [] }));
    res.json({ listings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil listing untuk moderasi.' });
  }
});

router.post('/listings/:id/approve', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE listings SET status = 'aktif', updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan.' });
    clearListingsCache();
    res.json({ listing: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menyetujui listing.' });
  }
});

router.post('/listings/:id/reject', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE listings SET status = 'ditolak', updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan.' });
    clearListingsCache();
    res.json({ listing: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menolak listing.' });
  }
});

module.exports = router;
