import { ok, route } from "@/lib/http";
import { registrationOptions } from "@/lib/services/visits";
import { todayLocal, addDays } from "@/lib/time";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

// Rumah sakit & poli yang dapat dipilih pasien di formulir pendaftaran.
export const GET = route(async () => {
  const today = todayLocal();
  return ok(await registrationOptions(), { today, max_date: addDays(today, config.maxAdvanceDays) });
});
