const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { authLimiter, verifyLimiter } = require('../middleware/rateLimit');
const { requireAuth } = require('../middleware/auth');
const { sendEmail } = require('../config/email');

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

function frontendUrl() {
  const origins = (process.env.FRONTEND_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
  return origins[0] || 'https://rumah-ku.netlify.app';
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function sendVerificationEmail(user) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await pool.query(
    'UPDATE users SET email_verify_token_hash = $1, email_verify_expires = $2 WHERE id = $3',
    [tokenHash, expires, user.id]
  );
  const link = `${frontendUrl()}/#verify-email/${rawToken}`;
  await sendEmail(
    user.email,
    'Verifikasi email Rumahku kamu',
    `<p>Halo ${user.name},</p>
     <p>Klik tombol di bawah untuk memverifikasi email kamu di Rumahku:</p>
     <p><a href="${link}" style="background:#8C3A17;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Verifikasi Email</a></p>
     <p>Atau salin tautan ini ke browser: ${link}</p>
     <p style="color:#888;font-size:12px;">Tautan berlaku 24 jam. Kalau kamu tidak merasa mendaftar di Rumahku, abaikan email ini.</p>`
  );
}

router.post(
  '/register',
  authLimiter,
  [
    body('name').trim().notEmpty().withMessage('Nama wajib diisi'),
    body('email').isEmail().withMessage('Email tidak valid'),
    body('password').isLength({ min: 6 }).withMessage('Password minimal 6 karakter'),
    body('whatsapp').trim().notEmpty().withMessage('Nomor WhatsApp wajib diisi'),
    body('role').isIn(['penjual', 'pembeli']).withMessage('Peran harus penjual atau pembeli')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { name, email, password, whatsapp, role } = req.body;
    try {
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Email sudah terdaftar.' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const result = await pool.query(
        'INSERT INTO users (name, email, password_hash, whatsapp, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, whatsapp, is_admin, role, email_verified, wa_verified',
        [name, email, passwordHash, whatsapp, role]
      );

      const user = result.rows[0];
      await sendVerificationEmail(user);

      const token = signToken(user.id);
      res.status(201).json({
        user,
        token,
        message: 'Akun dibuat. Cek email kamu untuk verifikasi sebelum menggunakan fitur penuh.'
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal mendaftarkan akun.' });
    }
  }
);

router.post(
  '/login',
  authLimiter,
  [body('email').isEmail(), body('password').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Email atau password tidak valid.' });

    const { email, password } = req.body;
    try {
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      const user = result.rows[0];
      if (!user) return res.status(401).json({ error: 'Email atau password salah.' });

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return res.status(401).json({ error: 'Email atau password salah.' });

      const token = signToken(user.id);
      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          whatsapp: user.whatsapp,
          is_admin: user.is_admin,
          role: user.role,
          email_verified: user.email_verified,
          wa_verified: user.wa_verified
        },
        token
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal login.' });
    }
  }
);

router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, whatsapp, is_admin, role, email_verified, wa_verified FROM users WHERE id = $1',
      [req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil data akun.' });
  }
});

router.post('/verify-email', [body('token').notEmpty()], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Token tidak valid.' });
  try {
    const tokenHash = hashToken(req.body.token);
    const result = await pool.query(
      'SELECT id, email_verify_expires FROM users WHERE email_verify_token_hash = $1',
      [tokenHash]
    );
    const user = result.rows[0];
    if (!user || !user.email_verify_expires || new Date(user.email_verify_expires) < new Date()) {
      return res.status(400).json({ error: 'Tautan verifikasi tidak valid atau sudah kedaluwarsa.' });
    }
    await pool.query(
      'UPDATE users SET email_verified = true, email_verify_token_hash = NULL, email_verify_expires = NULL WHERE id = $1',
      [user.id]
    );
    res.json({ message: 'Email berhasil diverifikasi.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memverifikasi email.' });
  }
});

router.post('/resend-verification', requireAuth, verifyLimiter, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, email_verified FROM users WHERE id = $1', [req.userId]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
    if (user.email_verified) return res.status(400).json({ error: 'Email kamu sudah terverifikasi.' });
    await sendVerificationEmail(user);
    res.json({ message: 'Email verifikasi baru sudah dikirim.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengirim ulang email verifikasi.' });
  }
});

router.post('/send-wa-code', requireAuth, verifyLimiter, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, whatsapp, wa_verified FROM users WHERE id = $1', [req.userId]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
    if (user.wa_verified) return res.status(400).json({ error: 'Nomor WhatsApp kamu sudah terverifikasi.' });

    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    await pool.query('UPDATE users SET wa_verify_code = $1 WHERE id = $2', [code, user.id]);

    const adminWa = process.env.ADMIN_WHATSAPP;
    const text = `Verifikasi akun Rumahku\nNama: ${user.name}\nKode: ${code}`;
    const waLink = adminWa ? `https://wa.me/${adminWa}?text=${encodeURIComponent(text)}` : null;

    res.json({ code, waLink, message: 'Kirim kode ini lewat WhatsApp ke nomor Rumahku untuk verifikasi.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal membuat kode verifikasi WhatsApp.' });
  }
});

module.exports = router;
