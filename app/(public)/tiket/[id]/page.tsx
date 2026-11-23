import { TicketView } from "@/components/patient/TicketView";

export const metadata = { title: "Tiket Anda", robots: { index: false, follow: false } };

export default async function TiketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="frame">
      <div className="page">
        <TicketView visitId={id} />
      </div>
    </div>
  );
}
