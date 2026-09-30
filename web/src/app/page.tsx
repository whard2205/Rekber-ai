import Link from "next/link";
import { listDeals } from "@/lib/deals";
import { explorerAddressUrl, rupiah, shortAddress } from "@/lib/format";

/** Halaman utama (docs/rekber-ai/PLAN.md §3.6 "/"): klaim satu kalimat, cara kerja, fakta yang
 * bisa dicek (alamat kontrak, fee, ambang AI), lalu transaksi terbaru. */

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const deals = (await listDeals()).filter((d) => d.spec.listingPhotos.length > 0).slice(0, 5);
  const escrow = process.env.NEXT_PUBLIC_ESCROW_ADDRESS;
  const escrowUrl = escrow ? explorerAddressUrl(escrow) : null;

  return (
    <div>
      <section className="hero">
        <h1>Rekber tanpa admin.</h1>
        <p>
          Uang pembeli dikunci di smart contract, bukan di rekening orang. Kalau ada komplain, AI membandingkan
          janji penjual, foto packing, dan foto unboxing, lalu memutus. Kami sendiri tidak bisa menyentuh uangnya.
        </p>
        <Link className="btn" href="/jual">
          Mulai jualan
        </Link>
      </section>

      <p className="section-label">Cara kerja</p>
      <ol className="steps">
        <li>
          Penjual posting barang
          <span>Foto + deskripsi. AI menyusun daftar janji (spec) yang ditandatangani penjual.</span>
        </li>
        <li>
          Pembeli bayar
          <span>Uang masuk kontrak. Tanpa install wallet, tanpa bayar gas.</span>
        </li>
        <li>
          Penjual kirim dengan bukti
          <span>Foto barangnya sendiri di samping kode transaksi, bukan cuma dus.</span>
        </li>
        <li>
          Pembeli konfirmasi, atau komplain
          <span>Konfirmasi: uang cair ke penjual. Komplain: AI memutus refund atau cair, atau menyerahkan ke manusia kalau ragu.</span>
        </li>
      </ol>

      <p className="section-label">Yang bisa kamu cek sendiri</p>
      <dl className="facts">
        <dt>Kontrak</dt>
        <dd>
          {escrow && escrowUrl ? (
            <a className="mono" href={escrowUrl} target="_blank" rel="noreferrer">
              {shortAddress(escrow)} ↗
            </a>
          ) : (
            "RekberEscrow di BNB Smart Chain"
          )}{" "}
          · terverifikasi di BscScan
        </dd>
        <dt>Fee</dt>
        <dd>1%, hanya saat uang cair ke penjual. Refund gratis.</dd>
        <dt>AI</dt>
        <dd>Hanya memutus kalau yakin ≥ 85%. Di bawah itu, arbiter manusia yang memutus.</dd>
        <dt>Server mati?</dt>
        <dd>Tidak dikirim = refund, pembeli diam = cair, sengketa kedaluwarsa = bagi 50/50. Uang tidak pernah nyangkut.</dd>
      </dl>

      {deals.length > 0 && (
        <>
          <p className="section-label">Transaksi terbaru</p>
          {deals.map((d) => (
            <Link key={d.dealCode} href={`/d/${d.dealCode}`} className="row-link">
              <span style={{ fontWeight: 500 }}>{d.spec.title}</span>
              <span className="bounty">{rupiah(d.spec.priceIDRX)}</span>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
