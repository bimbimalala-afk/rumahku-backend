const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/listings', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.*, u.name, u.email FROM listings l
       JOIN users u ON u.id = l.user_id WHERE l.status = 'draft'
       ORDER BY l.created_at ASC`
    );
    res.json({ pendingListings: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal ambil listing pending' });
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE listings SET status = 'active', rejection_reason = NULL, updated_at = now()
       WHERE id = $1 AND status = 'draft' RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan' });
    res.json({ listing: result.rows[0], message: 'Iklan disetujui.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal approve listing' });
  }
});

router.post(
  '/:id/reject',
  [body('reason').trim().notEmpty().isLength({ max: 500 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Alasan penolakan diperlukan' });

    try {
      const result = await pool.query(
        `UPDATE listings SET status = 'rejected', rejection_reason = $1, updated_at = now()
         WHERE id = $2 AND status = 'draft' RETURNING *`,
        [req.body.reason, req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan' });
      res.json({ listing: result.rows[0], message: 'Iklan ditolak.' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal reject listing' });
    }
  }
);

module.exports = router;
