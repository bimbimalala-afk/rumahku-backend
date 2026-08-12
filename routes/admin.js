const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { clearListingsCache } = require('../middleware/cache');
const { sendEmail, frontendUrl } = require('../config/email');
const { sendPushToUser } = require('../config/push');

const router = express.Router();

router.use(requireAuth, requireAdmin);

async function notifyListingDecision(listingId, approved){
  try{
    const result = await pool.query(
      `SELECT l.title, u.id AS owner_id, u.name AS owner_name, u.email AS owner_email
       FROM listings l JOIN users u ON u.id = l.user_id
       WHERE l.id = $1`,
      [listingId]
    );
    const row = result.rows[0];
    if(!row) return;

    if(approved){
      await sendEmail(
        row.owner_email,
        `Iklan "${row.title}" sudah disetujui`,
        `<p>Halo ${row.owner_name},</p>
         <p>Kabar baik! Iklan kamu <strong>${row.title}</strong> sudah disetujui dan sekarang tayang di Rumahku.</p>
         <p><a href="${frontendUrl()}/#rumah/${listingId}" style="background:#3C6E4C;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Lihat Iklan</a></p>`
      );
      await sendPushToUser(row.owner_id, {
        title: 'Iklan kamu disetujui ✅',
        body: `"${row.title}" sekarang tayang di Rumahku.`,
        url: `${frontendUrl()}/#rumah/${listingId}`
      });
    }else{
      await sendEmail(
        row.owner_email,
        `Iklan "${row.title}" belum bisa disetujui`,
        `<p>Halo ${row.owner_name},</p>
         <p>Iklan kamu <strong>${row.title}</strong> belum bisa disetujui oleh tim kami saat ini. Kamu bisa periksa dan perbarui detailnya lewat menu "Iklan Saya" di Rumahku, lalu ajukan lagi.</p>
         <p><a href="${frontendUrl()}" style="background:#8C3A17;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Buka Rumahku</a></p>`
      );
      await sendPushToUser(row.owner_id, {
        title: 'Iklan kamu belum disetujui',
        body: `"${row.title}" perlu diperbarui. Cek menu Iklan Saya.`,
        url: frontendUrl()
      });
    }
  }catch(err){
    console.error('Gagal mengirim notifikasi keputusan listing:', err.message);
  }
}

router.get('/listings', async (req, res) => {
  const status = req.query.status || 'pending_review';
  try {
    const result = await pool.query(
      `SELECT l.*, u.name AS owner_name, u.email AS owner_email, u.whatsapp AS owner_whatsapp
       FROM listings l JOIN users u ON u.id = l.user_id
       WHERE l.status = $1
       ORDER BY l.created_at ASC`,
      [status]
    );
    const ids = result.rows.map((l) => l.id);
    let photosByListing = {};
    if (ids.length > 0) {
      const photos = await pool.query('SELECT * FROM listing_photos WHERE listing_id = ANY($1)', [ids]);
      photos.rows.forEach((p) => {
        photosByListing[p.listing_id] = photosByListing[p.listing_id] || [];
        photosByListing[p.listing_id].push(p);
      });
    }
    const listings = result.rows.map((l) => ({ ...l, photos: photosByListing[l.id] || [] }));
    res.json({ listings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil listing untuk moderasi.' });
  }
});

router.post('/listings/:id/approve', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE listings SET status = 'aktif', updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan.' });
    clearListingsCache();
    notifyListingDecision(req.params.id, true);
    res.json({ listing: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menyetujui listing.' });
  }
});

router.post('/listings/:id/reject', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE listings SET status = 'ditolak', updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan.' });
    clearListingsCache();
    notifyListingDecision(req.params.id, false);
    res.json({ listing: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menolak listing.' });
  }
});

router.post('/listings/:id/deactivate', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE listings SET status = 'nonaktif', updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan.' });
    clearListingsCache();
    res.json({ listing: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menonaktifkan listing.' });
  }
});

router.get('/wa-verifications', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, whatsapp, wa_verify_code
       FROM users
       WHERE wa_verify_code IS NOT NULL AND wa_verified = false
       ORDER BY id ASC`
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil daftar verifikasi WhatsApp.' });
  }
});

router.post('/users/:id/verify-wa', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE users SET wa_verified = true, wa_verify_code = NULL WHERE id = $1 RETURNING id, name, wa_verified`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menandai verifikasi WhatsApp.' });
  }
});

module.exports = router;
