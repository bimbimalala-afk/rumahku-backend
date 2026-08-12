-- Migrasi v10: kategori tipe rumah (Rumah Tapak, Townhouse, Cluster, dll)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS kategori VARCHAR(30) NOT NULL DEFAULT 'lainnya';
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_kategori_check;
ALTER TABLE listings ADD CONSTRAINT listings_kategori_check
  CHECK (kategori IN ('rumah_tapak', 'townhouse', 'cluster', 'ruko_toko', 'tanah_kavling', 'lainnya'));

CREATE INDEX IF NOT EXISTS idx_listings_kategori ON listings (kategori);
