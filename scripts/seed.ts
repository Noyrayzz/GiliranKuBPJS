import { migrate } from "./migrate";
import { pool } from "../lib/db";
import { seedDemo, DEMO_ACCOUNTS, DEMO_PASSWORD } from "../lib/services/demo";

migrate()
  .then(() => seedDemo(null))
  .then(async (s) => {
    console.log(JSON.stringify({ ...s, note: "Akun demo: " + DEMO_ACCOUNTS.map((a) => a.username).join(", ") + ` / ${DEMO_PASSWORD}` }, null, 2));
    await pool.end();
  })
  .catch(async (e) => {
    console.error("seed gagal:", e.message);
    await pool.end();
    process.exit(1);
  });
