-- Skema database Rumahku
-- Jalankan: psql $DATABASE_URL -f db/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  whatsapp VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS listings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  tipe VARCHAR(10) NOT NULL CHECK (tipe IN ('jual', 'sewa')),
  kota VARCHAR(80) NOT NULL,
  area VARCHAR(120) NOT NULL,
  harga NUMERIC(14,2) NOT NULL,
  unit VARCHAR(20) NOT NULL DEFAULT 'juta',
  luas_tanah INTEGER NOT NULL,
  kamar_tidur INTEGER NOT NULL,
  kamar_mandi INTEGER NOT NULL,
  deskripsi TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'terjual', 'tersewa', 'nonaktif', 'pending_review')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS listing_photos (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  is_cover BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listings_kota ON listings(kota);
CREATE INDEX IF NOT EXISTS idx_listings_tipe ON listings(tipe);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_user ON listings(user_id);
