import { redirect } from "next/navigation";
import { AdminConsole } from "@/components/admin/AdminConsole";
import { ToastProvider } from "@/components/Toast";
import { config } from "@/lib/config";
import { currentStaff } from "@/lib/server-auth";
import { defaultHospitalId } from "@/lib/services/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Administrasi" };

export default async function AdminPage() {
  const s = await currentStaff();
  if (!s) redirect("/masuk");
  if (s.role !== "admin") redirect("/petugas");
  const hospitalId = s.hospitalId ?? (await defaultHospitalId());
  return (
    <div className="frame">
      <div className="page" style={{ paddingTop: 32 }}>
        <ToastProvider>
          <AdminConsole hospitalId={hospitalId} demoMode={config.demoMode} selfId={s.id} />
        </ToastProvider>
      </div>
    </div>
  );
}
