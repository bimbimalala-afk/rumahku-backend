const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { requireVerifiedEmail } = require('../middleware/verified');

const router = express.Router();

const VALID_REASONS = ['harga_tidak_wajar', 'foto_palsu', 'penjual_tidak_responsif', 'diduga_penipuan', 'listing_duplikat', 'lainnya'];

router.post(
  '/listings/:id/report',
  requireAuth,
  requireVerifiedEmail,
  [
    body('reason').isIn(VALID_REASONS).withMessage('Alasan laporan tidak valid.'),
    body('detail').optional().trim().isLength({ max: 500 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    try {
      const listing = await pool.query('SELECT id FROM listings WHERE id = $1', [req.params.id]);
      if (listing.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan.' });

      const existing = await pool.query(
        'SELECT id FROM listing_reports WHERE listing_id = $1 AND reporter_id = $2',
        [req.params.id, req.userId]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Kamu sudah pernah melaporkan listing ini.' });
      }

      const result = await pool.query(
        'INSERT INTO listing_reports (listing_id, reporter_id, reason, detail) VALUES ($1, $2, $3, $4) RETURNING *',
        [req.params.id, req.userId, req.body.reason, req.body.detail || null]
      );
      res.status(201).json({ report: result.rows[0], message: 'Laporan diterima, tim kami akan meninjau.' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal mengirim laporan.' });
    }
  }
);

router.get('/admin/reports', requireAuth, requireAdmin, async (req, res) => {
  const status = req.query.status || 'baru';
  try {
    const result = await pool.query(
      `SELECT r.*, l.title AS listing_title, l.status AS listing_status,
              reporter.name AS reporter_name, reporter.email AS reporter_email
       FROM listing_reports r
       JOIN listings l ON l.id = r.listing_id
       JOIN users reporter ON reporter.id = r.reporter_id
       WHERE r.status = $1
       ORDER BY r.created_at DESC`,
      [status]
    );
    res.json({ reports: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil daftar laporan.' });
  }
});

router.post('/admin/reports/:id/resolve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE listing_reports SET status = 'selesai' WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Laporan tidak ditemukan.' });
    res.json({ report: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memperbarui laporan.' });
  }
});

module.exports = router;
