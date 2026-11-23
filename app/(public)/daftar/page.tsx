import { RegisterForm } from "@/components/patient/RegisterForm";
import { E, AppError } from "@/lib/errors";
import { lookupQr, registrationOptions } from "@/lib/services/visits";
import { addDays, todayLocal } from "@/lib/time";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ambil tiket" };

export default async function DaftarPage({ searchParams }: { searchParams: Promise<{ qr?: string }> }) {
  const { qr } = await searchParams;
  const today = todayLocal();
  const bounds = { today, max: addDays(today, config.maxAdvanceDays) };

  let qrError: string | null = null;
  let qrContext: Awaited<ReturnType<typeof lookupQr>> | null = null;
  if (qr) {
    try {
      qrContext = await lookupQr(qr);
    } catch (e) {
      qrError = e instanceof AppError ? e.message : E.notFound().message;
    }
  }

  // QR tidak berlaku: tidak ada formulir, tidak ada tiket (FR-003 AC2).
  const options = qr ? (qrContext ? [{ id: qrContext.hospital.id, name: qrContext.hospital.name, clinics: qrContext.registration.clinics }] : []) : await registrationOptions();

  return (
    <div className="frame">
      <div className="page">
        <RegisterForm
          options={options}
          bounds={bounds}
          fromQr={Boolean(qrContext)}
          preselectClinicId={qrContext?.registration.service_unit_id ?? null}
          qrError={qrError}
        />
      </div>
    </div>
  );
}
