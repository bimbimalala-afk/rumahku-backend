const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadBuffer } = require('../config/cloudinary');

const router = express.Router();

// CREATE - iklan baru, status draft (perlu moderasi)
router.post(
  '/',
  requireAuth,
  upload.array('images', 5),
  [
    body('title').trim().notEmpty(),
    body('description').trim().notEmpty(),
    body('harga').isInt({ min: 1 }),
    body('unit').isIn(['jual', 'sewa']),
    body('lokasi').trim().notEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Data tidak lengkap' });

    try {
      const uploaded = await Promise.all(req.files.map(f => uploadBuffer(f.buffer)));
      const imageUrls = uploaded.map(u => u.secure_url);
      const newStatus = 'draft';
      const result = await pool.query(
        `INSERT INTO listings (user_id, title, description, harga, unit, lokasi, images, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [req.userId, req.body.title, req.body.description, req.body.harga, 
         req.body.unit, req.body.lokasi, imageUrls, newStatus]
      );

      res.status(201).json({
        listing: result.rows[0],
        message: 'Iklan berhasil dikirim untuk moderasi admin.'
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal membuat listing' });
    }
  }
);

// UPDATE - edit iklan, langsung active (tanpa moderasi)
router.put(
  '/:id',
  requireAuth,
  upload.array('images', 5),
  [
    body('title').trim().notEmpty(),
    body('description').trim().notEmpty(),
    body('harga').isInt({ min: 1 }),
    body('unit').isIn(['jual', 'sewa']),
    body('lokasi').trim().notEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Data tidak lengkap' });

    try {
      const listing = await pool.query('SELECT user_id FROM listings WHERE id = $1', [req.params.id]);
      if (listing.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan' });
      if (listing.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Bukan listing kamu' });

      const imageUrls = req.files.length > 0 ? (await Promise.all(req.files.map(f => uploadBuffer(f.buffer)))).map(u => u.secure_url) : req.body.existingImages;
      const updateStatus = 'active';
      
      const result = await pool.query(
        `UPDATE listings 
         SET title = $1, description = $2, harga = $3, unit = $4, lokasi = $5, images = $6, status = $7, updated_at = now()
         WHERE id = $8 AND user_id = $9 RETURNING *`,
        [req.body.title, req.body.description, req.body.harga, req.body.unit,
         req.body.lokasi, imageUrls, updateStatus, req.params.id, req.userId]
      );

      res.json({
        listing: result.rows[0],
        message: 'Iklan diperbarui dan langsung tampil di dashboard.'
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal update listing' });
    }
  }
);

// GET semua listing aktif (untuk pembeli)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.*, u.name, u.id AS user_id FROM listings l
       JOIN users u ON u.id = l.user_id WHERE l.status = 'active'
       ORDER BY l.created_at DESC`
    );
    res.json({ listings: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal ambil listings' });
  }
});

// GET listing milik user sendiri (draft, active, rejected)
router.get('/my-listings', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM listings WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.userId]
    );
    res.json({ listings: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal ambil listings' });
  }
});

// GET detail listing (hanya active)
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.*, u.name, u.phone, u.id AS user_id FROM listings l
       JOIN users u ON u.id = l.user_id WHERE l.id = $1 AND l.status = 'active'`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan' });
    res.json({ listing: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal ambil listing' });
  }
});

module.exports = router;
