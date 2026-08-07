const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /listings?tipe=jual&kota=Bandung&min_harga=&max_harga=&page=1
router.get('/', async (req, res) => {
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
    res.json({ listings: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil daftar listing.' });
  }
});

// GET /listings/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.*, u.name AS owner_name, u.whatsapp AS owner_whatsapp
       FROM listings l JOIN users u ON u.id = l.user_id
       WHERE l.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan.' });
    res.json({ listing: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil detail listing.' });
  }
});

// POST /listings (butuh login)
router.post(
  '/',
  requireAuth,
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
        `INSERT INTO listings (user_id, title, tipe, kota, area, harga, unit, luas_tanah, kamar_tidur, kamar_mandi, deskripsi)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [req.userId, title, tipe, kota, area, harga, unit || 'juta', luas_tanah, kamar_tidur, kamar_mandi, deskripsi]
      );
      res.status(201).json({ listing: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal membuat listing.' });
    }
  }
);

// PUT /listings/:id (hanya pemilik)
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const owned = await pool.query('SELECT user_id FROM listings WHERE id = $1', [req.params.id]);
    if (owned.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan.' });
    if (owned.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Bukan pemilik listing ini.' });

    const fields = ['title', 'tipe', 'kota', 'area', 'harga', 'unit', 'luas_tanah', 'kamar_tidur', 'kamar_mandi', 'deskripsi', 'status'];
    const updates = [];
    const values = [];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        values.push(req.body[f]);
        updates.push(`${f} = $${values.length}`);
      }
    });
    if (updates.length === 0) return res.status(400).json({ error: 'Tidak ada data untuk diubah.' });

    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE listings SET ${updates.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
      values
    );
    res.json({ listing: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengubah listing.' });
  }
});

// DELETE /listings/:id (hanya pemilik)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const owned = await pool.query('SELECT user_id FROM listings WHERE id = $1', [req.params.id]);
    if (owned.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan.' });
    if (owned.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Bukan pemilik listing ini.' });

    await pool.query('DELETE FROM listings WHERE id = $1', [req.params.id]);
    res.json({ message: 'Listing berhasil dihapus.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus listing.' });
  }
});

module.exports = router;
