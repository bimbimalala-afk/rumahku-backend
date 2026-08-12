const express = require('express');
const pool = require('../db/pool');
const { frontendUrl } = require('../config/email');

const router = express.Router();

router.get('/sitemap.xml', async (req, res) => {
  try {
    const base = frontendUrl();
    const result = await pool.query(
      `SELECT id, updated_at FROM listings WHERE status = 'aktif' ORDER BY updated_at DESC LIMIT 5000`
    );

    const staticUrls = [
      { loc: `${base}/`, priority: '1.0' },
      { loc: `${base}/syarat-ketentuan.html`, priority: '0.3' },
      { loc: `${base}/kebijakan-privasi.html`, priority: '0.3' }
    ];

    const listingUrls = result.rows.map((l) => ({
      loc: `${base}/rumah/${l.id}`,
      lastmod: new Date(l.updated_at).toISOString().split('T')[0],
      priority: '0.8'
    }));

    const allUrls = [...staticUrls, ...listingUrls];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('Gagal membuat sitemap:', err.message);
    res.status(500).send('Gagal membuat sitemap.');
  }
});

module.exports = router;
