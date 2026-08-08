-- Migrasi v3: index untuk performa pencarian & filter
-- Aman dijalankan di database yang sudah berisi data (tidak menghapus apa pun)

CREATE INDEX IF NOT EXISTS idx_listings_status ON listings (status);
CREATE INDEX IF NOT EXISTS idx_listings_kota ON listings (kota);
CREATE INDEX IF NOT EXISTS idx_listings_tipe ON listings (tipe);
CREATE INDEX IF NOT EXISTS idx_listings_created_at ON listings (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_user_id ON listings (user_id);
CREATE INDEX IF NOT EXISTS idx_listings_status_created ON listings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listing_photos_listing_id ON listing_photos (listing_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
