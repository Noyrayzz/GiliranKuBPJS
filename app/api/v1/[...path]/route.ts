import { E } from "@/lib/errors";
import { fail } from "@/lib/http";

export const dynamic = "force-dynamic";

// Jalur /api/v1/* yang tidak dikenal tetap menjawab format galat kontrak (PRD §11), bukan halaman HTML 404.
const notFound = () => fail(E.notFound("Endpoint tidak ditemukan."));
export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE };
