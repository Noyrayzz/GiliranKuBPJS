import { redirect } from "next/navigation";
import { StaffNav } from "@/components/StaffNav";
import { currentStaff } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

// Dasbor staf: satu StaffNav, tanpa navigasi/footer publik (tidak ada chrome ganda).
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const staff = await currentStaff();
  if (!staff) redirect("/masuk");
  return (
    <>
      <StaffNav username={staff.username} role={staff.role} unitName={staff.unitName} />
      <main id="konten" className="nav-offset">
        {children}
      </main>
    </>
  );
}
