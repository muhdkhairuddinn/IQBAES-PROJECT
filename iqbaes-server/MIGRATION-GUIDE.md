# Database Migration Guide

Panduan ini akan membantu Anda melakukan migrasi database dari struktur lama ke struktur baru yang telah dinormalisasi.

## 🎯 Tujuan Migration

Migrasi ini akan:
- Memisahkan data security dari model `User` ke model `UserSecurity` yang terpisah
- Memisahkan data enrollment dari model `User` ke model `UserEnrollments` yang terpisah
- Memecah model `Log` monolitik menjadi beberapa model spesifik:
  - `SecurityLogs` - untuk log keamanan
  - `AuthenticationLogs` - untuk log autentikasi
  - `AuditLogs` - untuk log audit sistem
  - `SystemLogs` - untuk log sistem umum
- Membuat model `AlertResolutions` untuk menangani resolusi alert

## ⚠️ Persiapan Sebelum Migration

### 1. Backup Database
**WAJIB!** Backup database Anda sebelum menjalankan migration:

```bash
# Untuk MongoDB lokal
mongodump --db iqbaes --out ./backup

# Untuk MongoDB Atlas atau remote
mongodump --uri="mongodb+srv://username:password@cluster.mongodb.net/iqbaes" --out ./backup
```

### 2. Stop Application Server
Pastikan server aplikasi Anda tidak berjalan untuk menghindari konflik:

```bash
# Stop server jika sedang berjalan
# Ctrl+C atau kill process
```

### 3. Install Dependencies
Pastikan semua dependencies terinstall:

```bash
npm install
```

## 🚀 Menjalankan Migration

### Opsi 1: Migration dengan Konfirmasi (Recommended)
```bash
npm run migrate
```

Script ini akan:
- Menanyakan konfirmasi backup
- Menanyakan konfirmasi server sudah di-stop
- Menjalankan migration dengan aman
- Memberikan laporan progress

### Opsi 2: Migration Langsung
```bash
npm run migrate:direct
```

⚠️ **Hati-hati**: Opsi ini langsung menjalankan migration tanpa konfirmasi.

## 🔄 Proses Migration

Migration akan melakukan langkah-langkah berikut:

### 1. Migrasi Data User
- Membuat collection `usersecurities` dari field security di `users`
- Membuat collection `userenrollments` dari `enrolledCourseIds` di `users`
- Menghapus field lama dari collection `users`

### 2. Migrasi Data Log
- Menganalisis setiap log berdasarkan `type` dan `message`
- Memindahkan ke collection yang sesuai:
  - Security events → `securitylogs`
  - Authentication events → `authenticationlogs`
  - Audit events → `auditlogs`
  - System events → `systemlogs`
- Membuat backup collection `logs_backup_[timestamp]`

### 3. Cleanup
- Menghapus collection `logs` lama (setelah backup)
- Membersihkan field yang tidak diperlukan

## 📊 Monitoring Progress

Selama migration, Anda akan melihat:
- Progress bar untuk setiap tahap
- Jumlah record yang diproses
- Laporan error jika ada
- Statistik akhir migration

## 🔙 Rollback Migration

Jika terjadi masalah, Anda dapat melakukan rollback:

```bash
npm run migrate:rollback
```

Rollback akan:
- Menghapus collection baru yang dibuat migration
- Mengembalikan collection lama dari backup
- Mengembalikan struktur database ke kondisi semula

## ✅ Verifikasi Setelah Migration

### 1. Cek Collection Baru
```javascript
// Di MongoDB shell atau Compass
show collections

// Harus ada collection baru:
// - usersecurities
// - userenrollments
// - securitylogs
// - authenticationlogs
// - auditlogs
// - systemlogs
// - alertresolutions
```

### 2. Cek Data Count
```javascript
// Pastikan jumlah data sesuai
db.users.countDocuments()
db.usersecurities.countDocuments() // Harus sama dengan users
db.userenrollments.countDocuments() // Bisa berbeda (user tanpa enrollment)

// Cek total logs
db.securitylogs.countDocuments() + 
db.authenticationlogs.countDocuments() + 
db.auditlogs.countDocuments() + 
db.systemlogs.countDocuments()
// Harus sama dengan jumlah logs lama
```

### 3. Test Application
- Start server: `npm run dev`
- Test login/logout
- Test enrollment functions
- Test logging functions
- Cek dashboard admin

## 🐛 Troubleshooting

### Migration Gagal
1. Cek error message di console
2. Pastikan MongoDB connection string benar
3. Pastikan tidak ada aplikasi lain yang menggunakan database
4. Jalankan rollback jika perlu

### Data Tidak Sesuai
1. Cek backup collection masih ada
2. Bandingkan count data sebelum dan sesudah
3. Jalankan rollback dan coba lagi

### Performance Issues
1. Migration bisa lambat untuk database besar
2. Monitor memory usage
3. Pastikan MongoDB memiliki resource yang cukup

## 📝 Catatan Penting

- **Backup adalah WAJIB** - Jangan skip langkah ini!
- Migration bisa memakan waktu lama untuk database besar
- Pastikan koneksi internet stabil jika menggunakan MongoDB Atlas
- Test di environment development dulu sebelum production
- Simpan backup sampai yakin migration berhasil

## 🆘 Bantuan

Jika mengalami masalah:
1. Cek log error di console
2. Pastikan mengikuti semua langkah persiapan
3. Jangan ragu untuk rollback jika ada masalah
4. Backup selalu bisa dikembalikan manual jika diperlukan

---

**Selamat melakukan migration! 🚀**