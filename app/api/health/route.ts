import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Health check: status dependency (database). 503 bila database tidak terjangkau.
export async function GET() {
  const started = performance.now();
  let db: "up" | "down" = "up";
  try {
    await query("select 1");
  } catch {
    db = "down";
  }
  const body = { status: db === "up" ? "ok" : "degraded", dependencies: { database: db }, ms: Math.round(performance.now() - started) };
  return Response.json(body, { status: db === "up" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
