// Cache sederhana di memori server — cocok untuk skala saat ini (1 server).
// Kalau nanti sudah pakai lebih dari 1 server backend, ganti dengan Redis
// supaya semua server berbagi cache yang sama.

const store = new Map();

function cacheMiddleware(ttlSeconds = 30) {
  return (req, res, next) => {
    const key = req.originalUrl;
    const cached = store.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached.data);
    }

    const originalJson = res.json.bind(res);
    res.json = (data) => {
      store.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
      res.setHeader('X-Cache', 'MISS');
      return originalJson(data);
    };

    next();
  };
}

function clearListingsCache() {
  for (const key of store.keys()) {
    if (key.startsWith('/listings') || key.startsWith('/?') || key === '/listings') {
      store.delete(key);
    }
  }
}

module.exports = { cacheMiddleware, clearListingsCache };
