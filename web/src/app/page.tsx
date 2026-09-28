import Link from "next/link";
import { listDeals } from "@/lib/deals";
import { rupiah } from "@/lib/format";

/** Halaman utama (docs/rekber-ai/PLAN.md §3.6 "/"): hero satu kalimat, 3 langkah, tombol
 * "Mulai Jualan", daftar transaksi dari localStorage dibuat di R-09 (butuh peran pembeli). */

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const deals = listDeals().filter((d) => d.spec.listingPhotos.length > 0).slice(0, 5);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="card" style={{ textAlign: "center", padding: 28 }}>
        <h1 className="card-title" style={{ fontSize: 24 }}>
          Bayar aman jual-beli online
        </h1>
        <p className="card-meta" style={{ marginTop: 6 }}>
          Dana dikunci di kontrak pintar BSC. AI memeriksa bukti dan memutus sengketa —
          penjual tidak bisa lari, pembeli tidak bisa pura-pura barang rusak.
        </p>
        <Link className="btn" href="/jual" style={{ textDecoration: "none" }}>
          Mulai Jualan
        </Link>
      </div>

      <div className="card">
        <h2 className="card-title">3 langkah</h2>
        <ol className="criteria">
          <li>Penjual upload foto + AI bantu tulis janji (spec) barang</li>
          <li>Pembeli bayar — dana dikunci, tidak ada yang bisa ambil</li>
          <li>Penjual kirim + bukti foto; pembeli konfirmasi → dana cair. Sengketa? AI hakim</li>
        </ol>
      </div>

      {deals.length > 0 && (
        <div className="card">
          <h2 className="card-title">Transaksi terbaru</h2>
          {deals.map((d) => (
            <Link
              key={d.dealCode}
              href={`/d/${d.dealCode}`}
              style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "10px 0", borderTop: "1px solid var(--border)", textDecoration: "none" }}
            >
              <span style={{ fontWeight: 600 }}>{d.spec.title}</span>
              <span className="bounty">{rupiah(d.spec.priceIDRX)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
