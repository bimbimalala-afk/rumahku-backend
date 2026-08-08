const pool = require('../db/pool');

async function requireSeller(req, res, next) {
  try {
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [req.userId]);
    if (!result.rows[0] || result.rows[0].role !== 'penjual') {
      return res.status(403).json({ error: 'Hanya akun dengan peran Penjual yang bisa memasang iklan.' });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memverifikasi peran akun.' });
  }
}

module.exports = { requireSeller };
