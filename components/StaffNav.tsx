import Link from "next/link";
import { Wordmark } from "./Brand";
import { LogoutButton } from "./LogoutButton";
import { ROLE_LABEL, type StaffRole } from "@/lib/domain";

export function StaffNav({ username, role, unitName }: { username: string; role: StaffRole; unitName: string | null }) {
  return (
    <header className="nav">
      <div className="nav__inner">
        <Link href={role === "admin" ? "/admin" : "/petugas"} aria-label="Giliranku, dasbor">
          <Wordmark />
        </Link>
        <nav className="nav__links" aria-label="Petugas">
          {role === "admin" ? (
            <Link className="nav__link" href="/admin" aria-current="page">
              Administrasi
            </Link>
          ) : (
            <Link className="nav__link" href="/petugas" aria-current="page">
              Antrean {unitName ?? ""}
            </Link>
          )}
        </nav>
        <div className="nav__right">
          <div className="nav__who">
            <strong>{ROLE_LABEL[role]}</strong>
            {unitName ? `${unitName} · ` : ""}
            {username}
          </div>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
