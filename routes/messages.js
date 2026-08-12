const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { requireVerifiedEmail } = require('../middleware/verified');
const { sendEmail, frontendUrl } = require('../config/email');
const { sendPushToUser } = require('../config/push');

const router = express.Router();

async function notifyNewMessage(convo, senderId, content){
  try{
    const recipientId = convo.buyer_id === senderId ? convo.seller_id : convo.buyer_id;
    const result = await pool.query(
      `SELECT recipient.name AS recipient_name, recipient.email AS recipient_email,
              sender.name AS sender_name, l.title AS listing_title
       FROM users recipient, users sender, listings l
       WHERE recipient.id = $1 AND sender.id = $2 AND l.id = $3`,
      [recipientId, senderId, convo.listing_id]
    );
    const row = result.rows[0];
    if(!row) return;
    const preview = content.length > 140 ? content.slice(0, 140) + '…' : content;

    await sendEmail(
      row.recipient_email,
      `Pesan baru dari ${row.sender_name} di Rumahku`,
      `<p>Halo ${row.recipient_name},</p>
       <p><strong>${row.sender_name}</strong> mengirim pesan baru terkait listing <strong>${row.listing_title}</strong>:</p>
       <blockquote style="border-left:3px solid #8C3A17;padding-left:12px;color:#444;white-space:pre-line;margin:12px 0;">${preview}</blockquote>
       <p><a href="${frontendUrl()}" style="background:#8C3A17;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Buka Rumahku</a></p>
       <p style="color:#888;font-size:12px;">Buka menu "Pesan" di Rumahku untuk membalas.</p>`
    );

    await sendPushToUser(recipientId, {
      title: `Pesan baru dari ${row.sender_name}`,
      body: preview,
      url: frontendUrl()
    });
  }catch(err){
    console.error('Gagal mengirim notifikasi pesan baru:', err.message);
  }
}

router.post(
  '/conversations',
  requireAuth,
  requireVerifiedEmail,
  [body('listing_id').isInt()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'listing_id wajib diisi.' });

    try {
      const listing = await pool.query('SELECT id, user_id FROM listings WHERE id = $1', [req.body.listing_id]);
      if (listing.rows.length === 0) return res.status(404).json({ error: 'Listing tidak ditemukan.' });

      const sellerId = listing.rows[0].user_id;
      if (sellerId === req.userId) {
        return res.status(400).json({ error: 'Tidak bisa memulai percakapan dengan listing sendiri.' });
      }

      const existing = await pool.query(
        'SELECT * FROM conversations WHERE listing_id = $1 AND buyer_id = $2',
        [req.body.listing_id, req.userId]
      );
      if (existing.rows.length > 0) {
        return res.json({ conversation: existing.rows[0] });
      }

      const created = await pool.query(
        'INSERT INTO conversations (listing_id, buyer_id, seller_id) VALUES ($1, $2, $3) RETURNING *',
        [req.body.listing_id, req.userId, sellerId]
      );
      res.status(201).json({ conversation: created.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memulai percakapan.' });
    }
  }
);

router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, l.title AS listing_title, l.harga, l.unit,
              buyer.name AS buyer_name, seller.name AS seller_name,
              (SELECT content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
              (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != $1 AND m.read_at IS NULL) AS unread_count
       FROM conversations c
       JOIN listings l ON l.id = c.listing_id
       JOIN users buyer ON buyer.id = c.buyer_id
       JOIN users seller ON seller.id = c.seller_id
       WHERE c.buyer_id = $1 OR c.seller_id = $1
       ORDER BY COALESCE(
         (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
         c.created_at
       ) DESC`,
      [req.userId]
    );
    res.json({ conversations: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil daftar percakapan.' });
  }
});

async function assertParticipant(conversationId, userId) {
  const result = await pool.query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
  if (result.rows.length === 0) return null;
  const convo = result.rows[0];
  if (convo.buyer_id !== userId && convo.seller_id !== userId) return false;
  return convo;
}

router.get('/conversations/:id/messages', requireAuth, async (req, res) => {
  try {
    const convo = await assertParticipant(req.params.id, req.userId);
    if (convo === null) return res.status(404).json({ error: 'Percakapan tidak ditemukan.' });
    if (convo === false) return res.status(403).json({ error: 'Bukan bagian dari percakapan ini.' });

    const messages = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );

    await pool.query(
      'UPDATE messages SET read_at = now() WHERE conversation_id = $1 AND sender_id != $2 AND read_at IS NULL',
      [req.params.id, req.userId]
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`conversation:${req.params.id}`).emit('messages_read', { conversationId: parseInt(req.params.id), readerId: req.userId });
    }

    res.json({ messages: messages.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil pesan.' });
  }
});

router.post(
  '/conversations/:id/messages',
  requireAuth,
  requireVerifiedEmail,
  require('../middleware/rateLimit').messageLimiter,
  [body('content').trim().notEmpty().isLength({ max: 2000 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Pesan tidak boleh kosong.' });

    try {
      const convo = await assertParticipant(req.params.id, req.userId);
      if (convo === null) return res.status(404).json({ error: 'Percakapan tidak ditemukan.' });
      if (convo === false) return res.status(403).json({ error: 'Bukan bagian dari percakapan ini.' });

      const saved = await pool.query(
        'INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3) RETURNING *',
        [req.params.id, req.userId, req.body.content.trim()]
      );
      await pool.query('UPDATE conversations SET updated_at = now() WHERE id = $1', [req.params.id]);

      const recipientId = convo.buyer_id === req.userId ? convo.seller_id : convo.buyer_id;
      const io = req.app.get('io');
      if (io) {
        io.to(`conversation:${req.params.id}`).emit('new_message', saved.rows[0]);
        io.to(`user:${recipientId}`).emit('unread_update');
      }

      notifyNewMessage(convo, req.userId, req.body.content.trim());

      res.status(201).json({ message: saved.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal mengirim pesan.' });
    }
  }
);

module.exports = router;
