const webpush = require('web-push');
const pool = require('../db/pool');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@rumahku.sbs';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

async function sendPushToUser(userId, payload) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('VAPID key belum diatur — push notification dilewati.');
    return;
  }
  try {
    const result = await pool.query('SELECT * FROM push_subscriptions WHERE user_id = $1', [userId]);
    const payloadStr = JSON.stringify(payload);

    for (const sub of result.rows) {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      };
      try {
        await webpush.sendNotification(subscription, payloadStr);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          // Subscription sudah tidak berlaku (browser/perangkat lama) — bersihkan dari database.
          await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
        } else {
          console.error('Gagal kirim push notification:', err.message);
        }
      }
    }
  } catch (err) {
    console.error('Kesalahan sendPushToUser:', err.message);
  }
}

module.exports = { sendPushToUser, VAPID_PUBLIC_KEY };
