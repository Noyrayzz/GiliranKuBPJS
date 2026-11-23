import { redirect } from "next/navigation";
import { LoginForm } from "@/components/staff/LoginForm";
import { config } from "@/lib/config";
import { currentStaff } from "@/lib/server-auth";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/services/demo";
import { ROLE_LABEL, type StaffRole } from "@/lib/domain";

export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk petugas" };

export default async function MasukPage() {
  const staff = await currentStaff();
  if (staff) redirect(staff.role === "admin" ? "/admin" : "/petugas");
  // Kredensial demo hanya ditampilkan di lingkungan demo (data tiruan); DEMO_MODE=false menyembunyikannya.
  const demo = config.demoMode
    ? { password: DEMO_PASSWORD, accounts: DEMO_ACCOUNTS.map((a) => ({ username: a.username, label: ROLE_LABEL[a.role as StaffRole], unit: a.unit })) }
    : null;
  return (
    <div className="frame">
      <div className="page">
        <LoginForm demo={demo} />
      </div>
    </div>
  );
}
