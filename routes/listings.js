const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { requireSeller } = require('../middleware/seller');
const upload = require('../middleware/upload');
const { uploadBuffer } = require('../config/cloudinary');
const { clearListingsCache } = require('../middleware/cache');

const router = express.Router();

async function attachPhotos(listings) {
  const ids = listings.map((l) => l.id);
  if (ids.length === 0) return listings;
  const photos = await pool.query('SELECT * FROM listing_photos WHERE listing_id = ANY($1) ORDER BY is_cover DESC, created_at ASC', [ids]);
  const byListing = {};
  photos.rows.forEach((p) => {
    byListing[p.listing_id] = byListing[p.listing_id] || [];
    byListing[p.listing_id].push(p);
  });
  return listings.map((l) => ({ ...l, photos: byListing[l.id] || [] }));
}

// CREATE - iklan baru, status pending_review (perlu moderasi)
router.post(
  '/',
  requireAuth,
  requireSeller,
  [
    body('title').trim().notEmpty(),
    body('kota').trim().notEmpty(),
    body('area').trim().notEmpty(),
    body('tipe').isIn(['jual', 'sewa']),
    body('harga').isFloat({ min: 0.01 }),
    body('unit').trim().notEmpty(),
    body('luas_tanah').isInt({ min: 1 }),
    body('kamar_tidur').isInt({ min: 0 }),
    body('kamar_mandi').isInt({ min: 0 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Data tidak lengkap' });

    try {
      const result = await pool.query(
        `INSERT INTO listings (user_id, title, tipe, kota, area, harga, unit, luas_tanah, kamar_tidur, kamar_mandi, deskripsi, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [req.userId, req.body.title, req.body.tipe, req.body.kota, req.body.area, req.body.harga,
         req.body.unit, req.body.luas_tanah, req.body.kamar_tidur, req.body.kamar_mandi,
         req.body.deskripsi || 'Belum ada deskripsi tambahan dari pemilik.', 'pending_review']
      );
      clearListingsCache();
      res.status(201).json({
        listing: result.rows[0],
        message: 'Iklan berhasil dikirim. Menunggu persetujuan admin sebelum tayang ke publik.'
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal membuat listing' });
    }
  }
);

// UPDATE - edit iklan, kembali ke pending_review (direview ulang)
router.put(
  '/:id',
  requireAuth,
  requireSeller,
  [
    body('title').trim().notEmpty(),
    body('kota').trim().notEmpty(),
    body('area').trim().notEmpty(),
    body('tipe').isIn(['jual', 'sewa']),
    body('harga').isFloat({ min: 0.01 }),
    body('unit').trim().notEmpty(),
    body('luas_tanah').isInt({ min: 1 }),
    body('kamar_tidur').isInt({ min: 0 }),
    body('kamar_mandi').isInt({ min: 0 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Data tidak lengkap' });

    try {
      const listing = await pool.query('SELECT user_id FROM listings WHERE id = $1', [req.params.id]);
      if (listing.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan' });
      if (listing.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Bukan listing kamu' });

      const result = await pool.query(
        `UPDATE listings
         SET title = $1, tipe = $2, kota = $3, area = $4, harga = $5, unit = $6,
             luas_tanah = $7, kamar_tidur = $8, kamar_mandi = $9, deskripsi = $10,
             status = 'pending_review', updated_at = now()
         WHERE id = $11 AND user_id = $12 RETURNING *`,
        [req.body.title, req.body.tipe, req.body.kota, req.body.area, req.body.harga, req.body.unit,
         req.body.luas_tanah, req.body.kamar_tidur, req.body.kamar_mandi,
         req.body.deskripsi || 'Belum ada deskripsi tambahan dari pemilik.', req.params.id, req.userId]
      );
      clearListingsCache();
      res.json({
        listing: result.rows[0],
        message: 'Perubahan berhasil disimpan dan akan direview ulang oleh admin.'
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal update listing' });
    }
  }
);

// UPLOAD FOTO - tambah foto ke listing (Cloudinary)
router.post('/:id/photos', requireAuth, upload.array('photos', 5), async (req, res) => {
  try {
    const listing = await pool.query('SELECT user_id FROM listings WHERE id = $1', [req.params.id]);
    if (listing.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan' });
    if (listing.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Bukan listing kamu' });

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Tidak ada foto yang diunggah' });
    }

    const existing = await pool.query('SELECT COUNT(*)::int AS count FROM listing_photos WHERE listing_id = $1', [req.params.id]);
    const isFirstBatch = existing.rows[0].count === 0;

    const uploaded = await Promise.all(req.files.map((f) => uploadBuffer(f.buffer)));

    const inserted = [];
    for (let i = 0; i < uploaded.length; i++) {
      const isCover = isFirstBatch && i === 0;
      const result = await pool.query(
        `INSERT INTO listing_photos (listing_id, url, is_cover) VALUES ($1, $2, $3) RETURNING *`,
        [req.params.id, uploaded[i].secure_url, isCover]
      );
      inserted.push(result.rows[0]);
    }

    clearListingsCache();
    res.status(201).json({ photos: inserted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengunggah foto' });
  }
});

// GET semua listing aktif (untuk pembeli)
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const result = await pool.query(
      `SELECT l.*, u.name, u.id AS user_id FROM listings l
       JOIN users u ON u.id = l.user_id WHERE l.status = 'aktif'
       ORDER BY l.created_at DESC LIMIT $1`,
      [limit]
    );
    const listings = await attachPhotos(result.rows);
    res.json({ listings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal ambil listings' });
  }
});

// GET listing milik user sendiri (semua status)
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM listings WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.userId]
    );
    const listings = await attachPhotos(result.rows);
    res.json({ listings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal ambil listings' });
  }
});

// GET detail listing (hanya aktif)
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.*, u.name, u.whatsapp AS owner_whatsapp, u.id AS user_id FROM listings l
       JOIN users u ON u.id = l.user_id WHERE l.id = $1 AND l.status = 'aktif'`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan' });
    const [listing] = await attachPhotos(result.rows);
    res.json({ listing });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal ambil listing' });
  }
});

// DELETE - hapus listing milik sendiri
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const listing = await pool.query('SELECT user_id FROM listings WHERE id = $1', [req.params.id]);
    if (listing.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan' });
    if (listing.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Bukan listing kamu' });

    await pool.query('DELETE FROM listing_photos WHERE listing_id = $1', [req.params.id]);
    await pool.query('DELETE FROM listings WHERE id = $1', [req.params.id]);
    clearListingsCache();
    res.json({ message: 'Listing berhasil dihapus' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus listing' });
  }
});

module.exports = router;
