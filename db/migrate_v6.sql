-- Migrasi v6: laporan iklan mencurigakan
CREATE TABLE IF NOT EXISTS listing_reports (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason VARCHAR(50) NOT NULL,
  detail TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'baru' CHECK (status IN ('baru', 'ditinjau', 'selesai')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_listing ON listing_reports (listing_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON listing_reports (status);
