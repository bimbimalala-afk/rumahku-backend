// Kirim email lewat Resend (https://resend.com) — gratis untuk volume kecil.
// RESEND_API_KEY wajib diisi di Railway Variables. RESEND_FROM opsional
// (default pakai alamat pengujian Resend, cukup untuk skala Rumahku sekarang).

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || 'Rumahku <onboarding@resend.dev>';

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY belum diatur — email tidak terkirim:', subject, '->', to);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: RESEND_FROM, to, subject, html })
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('Gagal kirim email via Resend:', errText);
    }
  } catch (err) {
    console.error('Kesalahan saat memanggil Resend:', err.message);
  }
}

// Domain utama (branded) untuk tautan di email, sitemap, dll — bukan sekadar
// origin CORS pertama. Diatur lewat PRIMARY_DOMAIN di Railway Variables,
// dengan fallback ke origin pertama di FRONTEND_ORIGIN kalau belum diatur.
function frontendUrl() {
  if (process.env.PRIMARY_DOMAIN) {
    return process.env.PRIMARY_DOMAIN.trim().replace(/\/+$/, '');
  }
  const origins = (process.env.FRONTEND_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
  return origins[0] || 'https://rumah-ku.netlify.app';
}

module.exports = { sendEmail, frontendUrl };
