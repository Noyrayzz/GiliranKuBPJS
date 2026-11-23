import { migrate } from "./migrate";
import { pool } from "../lib/db";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, resetDemo } from "../lib/services/demo";

// Mengembalikan data demo ke baseline (FR-025): hapus data operasional + akun + token tiket, lalu seed ulang.
// Hanya berjalan bila DEMO_MODE tidak "false". Catatan audit lama ikut terhapus (satu-satunya jalur yang boleh TRUNCATE).
migrate()
  .then(() => resetDemo(null))
  .then(async (r) => {
    console.log("reset selesai:", JSON.stringify(r.counts));
    console.log(`akun demo: ${DEMO_ACCOUNTS.map((a) => a.username).join(", ")} / ${DEMO_PASSWORD}`);
    await pool.end();
  })
  .catch(async (e) => {
    console.error("reset gagal:", e.message);
    await pool.end();
    process.exit(1);
  });
