import Link from "next/link";
import { readDeal } from "@/lib/deals";
import { rupiah } from "@/lib/format";

/** Halaman deal `/d/[code]` — versi minimal R-08 (navigasi valid dari /jual + link share).
 * Tampilkan janji penjual + bukti + status. Alur penuh (bayar/kirim/konfirmasi/sengketa/
 * putusan) dibangun di R-09 — JANGAN implementasikan di sini. */

export const dynamic = "force-dynamic";

export default async function DealPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const deal = readDeal(code);

  if (!deal || !deal.spec.listingPhotos.length) {
    return (
      <div className="card">
        <h1 className="card-title">Transaksi tidak ditemukan</h1>
        <p className="card-meta">Kode transaksi {code} belum ada atau belum dipublikasi.</p>
        <Link className="btn" href="/jual">
          Buat transaksi baru
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="card">
        <h1 className="card-title">{deal.spec.title}</h1>
        <p className="card-meta">Kode transaksi {deal.dealCode}</p>
        <div className="bounty">{rupiah(deal.spec.priceIDRX)}</div>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 10 }}>{deal.spec.description}</p>
      </div>

      <div className="card">
        <h2 className="card-title">Janji penjual</h2>
        <ul className="criteria">
          {deal.spec.checklist.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
        <p className="card-meta" style={{ marginTop: 10 }}>
          Penjual: {deal.seller}
        </p>
      </div>

      <div className="card">
        <h2 className="card-title">Foto bukti</h2>
        {deal.spec.listingPhotos.map((name) => (
          <img
            key={name}
            className="preview"
            src={`/api/evidence/${name}`}
            alt={`Foto bukti ${name}`}
          />
        ))}
      </div>

      <div className="card">
        <p className="card-meta">
          specHash: <span style={{ fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>{deal.specHash}</span>
        </p>
        <Link className="btn btn-secondary" href="/jual">
          Buat transaksi sendiri
        </Link>
      </div>
    </div>
  );
}
