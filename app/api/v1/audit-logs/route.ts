import { ok, route } from "@/lib/http";
import { auditQuerySchema, parse } from "@/lib/validation";
import { requireAdmin } from "@/lib/services/auth";
import { listAuditLogs } from "@/lib/services/admin";

export const dynamic = "force-dynamic";

// GET /audit-logs?ticket_id=&date_from=&date_to= — Admin. Hanya baca: tidak ada PATCH/DELETE (NFR-012).
export const GET = route(async (req) => {
  await requireAdmin(req);
  const sp = new URL(req.url).searchParams;
  const f = parse(auditQuerySchema, {
    ticket_id: sp.get("ticket_id") ?? undefined,
    date_from: sp.get("date_from") ?? undefined,
    date_to: sp.get("date_to") ?? undefined,
    limit: sp.get("limit") ?? undefined,
  });
  const rows = await listAuditLogs(f);
  return ok(rows, { count: rows.length });
});
