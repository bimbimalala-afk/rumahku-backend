const pool = require('../db/pool');

async function requireAdmin(req, res, next) {
  try {
    const result = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.userId]);
    if (!result.rows[0] || !result.rows[0].is_admin) {
      return res.status(403).json({ error: 'Khusus admin.' });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memverifikasi hak akses.' });
  }
}

module.exports = { requireAdmin };
