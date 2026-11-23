import { redirect } from "next/navigation";
import { StaffBoard } from "@/components/staff/StaffBoard";
import { ToastProvider } from "@/components/Toast";
import { currentStaff } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Antrean unit" };

export default async function PetugasPage() {
  const s = await currentStaff();
  if (!s) redirect("/masuk");
  if (s.role === "admin" || !s.serviceUnitId || !s.unitType) redirect("/admin");
  return (
    <div className="frame">
      <div className="page" style={{ paddingTop: 32 }}>
        <ToastProvider>
          <StaffBoard unitId={s.serviceUnitId} unitName={s.unitName ?? ""} unitType={s.unitType} />
        </ToastProvider>
      </div>
    </div>
  );
}
