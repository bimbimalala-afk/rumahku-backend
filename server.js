require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');

const authRoutes = require('./routes/auth');
const listingRoutes = require('./routes/listings');
const adminRoutes = require('./routes/admin');
const messageRoutes = require('./routes/messages');
const reportRoutes = require('./routes/reports');
const adminModerationRoutes = require('./routes/admin-moderation');
const { generalLimiter } = require('./middleware/rateLimit');

const app = express();

app.set('trust proxy', 1);
const allowedOrigins = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Ditolak oleh kebijakan CORS.'));
  }
}));
app.use(compression());
app.use(express.json());
app.use('/uploads', express.static('uploads'));
app.use(generalLimiter);

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Rumahku API berjalan.' });
});

app.get('/health', async (req, res) => {
  const pool = require('./db/pool');
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

app.use('/auth', authRoutes);
app.use('/listings', listingRoutes);
app.use('/admin', adminRoutes);
app.use('/', messageRoutes);
app.use('/', reportRoutes);
app.use('/api/admin-moderation', adminModerationRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Rumahku API berjalan di port ${PORT}`);
});
