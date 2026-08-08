const rateLimit = require('express-rate-limit');

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan dari perangkat ini. Coba lagi beberapa menit lagi.' }
});

const createListingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Kamu sudah memasang beberapa iklan dalam 1 jam terakhir. Coba lagi nanti.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan masuk/daftar. Coba lagi dalam beberapa menit.' }
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak upload foto dalam waktu singkat. Coba lagi nanti.' }
});

const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak pesan dalam waktu singkat. Tunggu sebentar.' }
});

module.exports = { generalLimiter, createListingLimiter, authLimiter, uploadLimiter, messageLimiter };
