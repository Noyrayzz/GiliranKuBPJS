import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteNav />
      <main id="konten" className="nav-offset">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
