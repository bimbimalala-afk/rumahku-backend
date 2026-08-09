const pool = require('../db/pool');

async function requireVerifiedEmail(req, res, next) {
  try {
    const result = await pool.query('SELECT email_verified FROM users WHERE id = $1', [req.userId]);
    if (!result.rows[0] || !result.rows[0].email_verified) {
      return res.status(403).json({ error: 'Verifikasi email kamu dulu sebelum melakukan ini. Cek inbox atau folder spam.' });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memeriksa status verifikasi akun.' });
  }
}

async function requireVerifiedAccount(req, res, next) {
  try {
    const result = await pool.query('SELECT email_verified, wa_verified FROM users WHERE id = $1', [req.userId]);
    const u = result.rows[0];
    if (!u) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
    if (!u.email_verified) {
      return res.status(403).json({ error: 'Verifikasi email kamu dulu sebelum memasang iklan.' });
    }
    if (!u.wa_verified) {
      return res.status(403).json({ error: 'Verifikasi nomor WhatsApp kamu dulu sebelum memasang iklan. Buka halaman Akun untuk kirim kode verifikasi.' });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memeriksa status verifikasi akun.' });
  }
}

module.exports = { requireVerifiedEmail, requireVerifiedAccount };
