// Interval polling dipakai komponen klien, jadi tidak boleh mengimpor lib/config (membaca env + fs di server).
//
// Pasien: PRD §12.1 merekomendasikan polling 10 detik, sedangkan NFR-002/G-002 mensyaratkan perubahan tampil
// dalam <=10 detik. Polling 10 detik + waktu fetch selalu melewati 10 detik pada kasus terburuk, jadi interval
// diturunkan ke 8 detik: latensi terburuk = 8 detik + fetch (puluhan ms) < 10 detik.
export const PATIENT_POLL_MS = 8_000;
// Petugas melihat antrean yang berubah karena rekan kerja; lebih rapat agar tombol tidak basi.
export const STAFF_POLL_MS = 5_000;
