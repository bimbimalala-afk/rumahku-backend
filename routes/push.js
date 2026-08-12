const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { VAPID_PUBLIC_KEY } = require('../config/push');

const router = express.Router();

router.get('/push/vapid-public-key', (req, res) => {
  if (!VAPID_PUBLIC_KEY) return res.status(503).json({ error: 'Push notification belum dikonfigurasi.' });
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

router.post(
  '/push/subscribe',
  requireAuth,
  [
    body('endpoint').notEmpty(),
    body('keys.p256dh').notEmpty(),
    body('keys.auth').notEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Data subscription tidak valid.' });
    try {
      await pool.query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, p256dh = $3, auth = $4`,
        [req.userId, req.body.endpoint, req.body.keys.p256dh, req.body.keys.auth]
      );
      res.status(201).json({ message: 'Notifikasi push diaktifkan.' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal menyimpan subscription push.' });
    }
  }
);

router.post('/push/unsubscribe', requireAuth, [body('endpoint').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Endpoint tidak valid.' });
  try {
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [req.body.endpoint, req.userId]);
    res.json({ message: 'Notifikasi push dimatikan.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus subscription push.' });
  }
});

module.exports = router;
