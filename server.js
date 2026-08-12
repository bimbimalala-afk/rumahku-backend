require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const compression = require('compression');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const listingRoutes = require('./routes/listings');
const adminRoutes = require('./routes/admin');
const messageRoutes = require('./routes/messages');
const reportRoutes = require('./routes/reports');
const pushRoutes = require('./routes/push');
const { generalLimiter } = require('./middleware/rateLimit');
const pool = require('./db/pool');

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
app.use('/', pushRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

// ==================== SOCKET.IO (chat realtime) ====================
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length > 0 ? allowedOrigins : '*'
  }
});

io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) return next(new Error('Belum login.'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = payload.userId;
    next();
  } catch (err) {
    next(new Error('Token tidak valid atau sudah kedaluwarsa.'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.userId}`);

  socket.on('join_conversation', async (conversationId) => {
    try {
      const id = parseInt(conversationId);
      if (!id) return;
      const result = await pool.query(
        'SELECT buyer_id, seller_id FROM conversations WHERE id = $1',
        [id]
      );
      const convo = result.rows[0];
      if (!convo) return;
      if (convo.buyer_id !== socket.userId && convo.seller_id !== socket.userId) return;
      socket.join(`conversation:${id}`);
    } catch (err) {
      console.error('Gagal join_conversation:', err.message);
    }
  });

  socket.on('leave_conversation', (conversationId) => {
    const id = parseInt(conversationId);
    if (id) socket.leave(`conversation:${id}`);
  });
});

app.set('io', io);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Rumahku API + realtime chat berjalan di port ${PORT}`);
});
