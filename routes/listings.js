const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { requireSeller } = require('../middleware/seller');
const { requireVerifiedAccount } = require('../middleware/verified');
const { uploadBuffer } = require('../config/cloudinary');
const { createListingLimiter, uploadLimiter } = require('../middleware/rateLimit');
const { cacheMiddleware, clearListingsCache } = require('../middleware/cache');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('File harus berupa gambar.'));
    cb(null, true);
  }
});

async function attachPhotos(listings) {
  if (listings.length === 0) return listings;
  const ids = listings.map((l) => l.id);
  const photos = await pool.query(
    'SELECT * FROM listing_photos WHERE listing_id = ANY($1) ORDER BY is_cover DESC, id ASC',
    [ids]
  );
  const byListing = {};
  photos.rows.forEach((p) => {
    byListing[p.listing_id] = byListing[p.listing_id] || [];
    byListing[p.listing_id].push(p);
  });
  return listings.map((l) => ({ ...l, photos: byListing[l.id] || [] }));
}

router.get('/', cacheMiddleware(20), async (req, res) => {
  const { tipe, kota, min_harga, max_harga, page = 1, limit = 12 } = req.query;
  const conditions = ["status = 'aktif'"];
  const values = [];

  if (tipe) { values.push(tipe); conditions.push(`tipe = $${values.length}`); }
  if (kota) { values.push(`%${kota}%`); conditions.push(`kota ILIKE $${values.length}`); }
  if (min_harga) { values.push(min_harga); conditions.push(`harga >= $${values.length}`); }
  if (max_harga) { values.push(max_harga); conditions.push(`harga <= $${values.length}`); }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  values.push(limit, offset);

  try {
    const query = `
      SELECT l.*, u.name AS owner_name, u.whatsapp AS owner_whatsapp
      FROM listings l JOIN users u ON u.id = l.user_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY l.created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `;
    const result = await pool.query(query, values);
    const listings = await attachPhotos(result.rows);
    res.json({ listings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil daftar listing.' });
  }
});

router.get('/mine', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.*, u.name AS owner_name, u.whatsapp AS owner_whatsapp
       FROM listings l JOIN users u ON u.id = l.user_id
       WHERE l.user_id = $1 ORDER BY l.created_at DESC`,
      [req.userId]
    );
    const listings = await attachPhotos(result.rows);
    res.json({ listings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil listing kamu.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.*, u.name AS owner_name, u.whatsapp AS owner_whatsapp
       FROM listings l JOIN users u ON u.id = l.user_id
       WHERE l.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan.' });
    const [listing] = await attachPhotos(result.rows);
    res.json({ listing });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil detail listing.' });
  }
});

router.post(
  '/',
  requireAuth,
  requireSeller,
  requireVerifiedAccount,
  createListingLimiter,
  [
    body('title').trim().notEmpty(),
    body('tipe').isIn(['jual', 'sewa']),
    body('kota').trim().notEmpty(),
    body('area').trim().notEmpty(),
    body('harga').isFloat({ min: 0 }),
    body('luas_tanah').isInt({ min: 1 }),
    body('kamar_tidur').isInt({ min: 0 }),
    body('kamar_mandi').isInt({ min: 0 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Data tidak lengkap atau tidak valid.' });

    const { title, tipe, kota, area, harga, unit, luas_tanah, kamar_tidur, kamar_mandi, deskripsi } = req.body;
    try {
      const result = await pool.query(
        `INSERT INTO listings (user_id, title, tipe, kota, area, harga, unit, luas_tanah, kamar_tidur, kamar_mandi, deskripsi, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending_review') RETURNING *`,
        [req.userId, title, tipe, kota, area, harga, unit || 'juta', luas_tanah, kamar_tidur, kamar_mandi, deskripsi]
      );
      res.status(201).json({ listing: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal membuat listing.' });
    }
  }
);

router.post('/:id/photos', requireAuth, uploadLimiter, upload.array('photos', 5), async (req, res) => {
  try {
    const owned = await pool.query('SELECT user_id FROM listings WHERE id = $1', [req.params.id]);
    if (owned.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan.' });
    if (owned.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Bukan pemilik listing ini.' });
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Tidak ada foto yang dikirim.' });

    const existingCount = await pool.query('SELECT COUNT(*) FROM listing_photos WHERE listing_id = $1', [req.params.id]);
    const alreadyHasCover = parseInt(existingCount.rows[0].count) > 0;

    const uploaded = [];
    for (let i = 0; i < req.files.length; i++) {
      const result = await uploadBuffer(req.files[i].buffer, `rumahku/listing-${req.params.id}`);
      const isCover = !alreadyHasCover && i === 0;
      const saved = await pool.query(
        'INSERT INTO listing_photos (listing_id, url, is_cover) VALUES ($1, $2, $3) RETURNING *',
        [req.params.id, result.secure_url, isCover]
      );
      uploaded.push(saved.rows[0]);
    }
    res.status(201).json({ photos: uploaded });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Gagal mengunggah foto.' });
  }
});

router.delete('/:id/photos/:photoId', requireAuth, async (req, res) => {
  try {
    const owned = await pool.query('SELECT user_id FROM listings WHERE id = $1', [req.params.id]);
    if (owned.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan.' });
    if (owned.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Bukan pemilik listing ini.' });

    await pool.query('DELETE FROM listing_photos WHERE id = $1 AND listing_id = $2', [req.params.photoId, req.params.id]);
    res.json({ message: 'Foto dihapus.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus foto.' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const owned = await pool.query('SELECT user_id, status FROM listings WHERE id = $1', [req.params.id]);
    if (owned.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan.' });
    if (owned.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Bukan pemilik listing ini.' });

    const editableFields = ['title', 'tipe', 'kota', 'area', 'harga', 'unit', 'luas_tanah', 'kamar_tidur', 'kamar_mandi', 'deskripsi'];
    const ownerAllowedStatus = ['terjual', 'tersewa', 'nonaktif'];
    const updates = [];
    const values = [];

    editableFields.forEach((f) => {
      if (req.body[f] !== undefined) {
        values.push(req.body[f]);
        updates.push(`${f} = $${values.length}`);
      }
    });

    if (updates.length > 0) {
      updates.push(`status = 'pending_review'`);
    }

    if (req.body.status !== undefined && ownerAllowedStatus.includes(req.body.status)) {
      values.push(req.body.status);
      updates.push(`status = $${values.length}`);
    }

    if (updates.length === 0) return res.status(400).json({ error: 'Tidak ada data untuk diubah.' });

    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE listings SET ${updates.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
      values
    );
    clearListingsCache();
    res.json({ listing: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengubah listing.' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const owned = await pool.query('SELECT user_id FROM listings WHERE id = $1', [req.params.id]);
    if (owned.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan.' });
    if (owned.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Bukan pemilik listing ini.' });

    await pool.query('DELETE FROM listings WHERE id = $1', [req.params.id]);
    clearListingsCache();
    res.json({ message: 'Listing berhasil dihapus.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus listing.' });
  }
});

module.exports = router;
