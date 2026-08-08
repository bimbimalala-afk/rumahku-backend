require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const listingRoutes = require('./routes/listings');
const adminRoutes = require('./routes/admin');
const { generalLimiter } = require('./middleware/rateLimit');

const app = express();

app.set('trust proxy', 1);
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*' }));
app.use(express.json());
app.use(generalLimiter);

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Rumahku API berjalan.' });
});

app.use('/auth', authRoutes);
app.use('/listings', listingRoutes);
app.use('/admin', adminRoutes);

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
