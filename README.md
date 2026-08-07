# Rumahku Backend

API sederhana untuk platform jual & sewa rumah — Express.js + PostgreSQL.

## Menjalankan di komputer sendiri

```bash
npm install
cp .env.example .env
# edit .env, isi DATABASE_URL dan JWT_SECRET

npm run migrate   # membuat tabel di database
npm run dev        # jalan di http://localhost:4000
```

## Endpoint yang tersedia

**Auth**
- `POST /auth/register` — { name, email, password, whatsapp }
- `POST /auth/login` — { email, password } → mengembalikan token

**Listings**
- `GET /listings?tipe=jual&kota=Bandung` — daftar listing (publik)
- `GET /listings/:id` — detail satu listing (publik)
- `POST /listings` — buat listing baru (butuh header `Authorization: Bearer <token>`)
- `PUT /listings/:id` — ubah listing milik sendiri
- `DELETE /listings/:id` — hapus listing milik sendiri

## Deploy ke produksi (gratis untuk mulai)

1. **Database**: buat PostgreSQL gratis di [Railway](https://railway.app), [Render](https://render.com), atau [Supabase](https://supabase.com) — salin connection string ke `DATABASE_URL`
2. **Backend**: push folder ini ke GitHub, lalu deploy ke Railway atau Render (keduanya baca `package.json` otomatis)
3. Set environment variables (`DATABASE_URL`, `JWT_SECRET`, `FRONTEND_ORIGIN`) di dashboard hosting
4. Jalankan migrasi sekali di server: `npm run migrate`
5. Frontend (file `rumahku.html`) tinggal diarahkan fetch ke URL backend, contoh:
   ```js
   fetch('https://rumahku-api.up.railway.app/listings?tipe=jual')
   ```

## Langkah lanjutan yang disarankan

- Tambah endpoint upload foto (Cloudinary/S3) — kolom `listing_photos` sudah disiapkan di skema
- Tambah rate limiting (`express-rate-limit`) untuk cegah spam listing
- Tambah endpoint moderasi admin (approve/reject listing baru)
- Tambah pencarian radius lokasi kalau nanti pakai koordinat peta
