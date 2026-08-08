-- Migrasi v2: menambahkan fitur moderasi & admin
-- Aman dijalankan di database yang sudah berisi data (tidak menghapus apa pun)

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE listings ADD CONSTRAINT listings_status_check
  CHECK (status IN ('aktif', 'terjual', 'tersewa', 'nonaktif', 'pending_review', 'ditolak'));

ALTER TABLE listings ALTER COLUMN status SET DEFAULT 'pending_review';
