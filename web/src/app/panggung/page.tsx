"use client";

/** Layar panggung `/panggung` untuk Demo Day (docs/rekber-ai/PLAN.md §3.6/R-10) — disorot
 * proyektor 1920×1080, dibaca dari jauh: deal "spotlight" (timeline besar, thumbnail bukti,
 * label cek pengiriman AI) + feed keputusan AI (dari data/audit-log.jsonl) + QR besar ke
 * deal spotlight (`?deal=RKB-…`, kalau kosong server pilih otomatis — lihat
 * api/dashboard/route.ts). Poll tiap 2 detik supaya event terlihat ≤ 3 detik.
 */
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { rupiah, shortAddress } from "@/lib/format";

const Status = { None: 0, Funded: 1, Shipped: 2, Disputed: 3, Escalated: 4, Released: 5, Refunded: 6, Split: 7 } as const;
const STATUS_LABEL: Record<number, string> = {
  [Status.None]: "Menunggu pembayaran",
  [Status.Funded]: "Dibayar — dana terkunci",
  [Status.Shipped]: "Dikirim",
  [Status.Disputed]: "Sengketa",
  [Status.Escalated]: "Dieskalasi ke arbiter manusia",
  [Status.Released]: "SELESAI — dana cair ke penjual",
  [Status.Refunded]: "SELESAI — dana kembali ke pembeli",
  [Status.Split]: "SELESAI — dana dibagi 50/50",
};
const OUTCOME_ICON: Record<string, string> = { REFUND: "💸", RELEASE: "✅", ESCALATE: "🙋" };

interface Spec {
  title: string;
  priceIDRX: string;
  listingPhotos: string[];
}

interface OnchainDeal {
  status: number;
  buyer: string;
  seller: string;
  fundedAt: number;
  shippedAt: number;
  disputedAt: number;
  verdictHash: string;
}

interface ShipmentCheck {
  itemVisible: boolean;
  itemMatchesListing: boolean;
  dealCodeVisible: boolean;
  warnings: string[];
}

interface VerdictCommit {
  outcome: "REFUND" | "RELEASE" | "ESCALATE";
  confidence: number;
  reasons: string[];
}

interface Spotlight {
  deal: { dealCode: string; spec: Spec; createdAt: string };
  onchain: OnchainDeal | null;
  verdict: { shipmentCheck?: ShipmentCheck; commit?: VerdictCommit } | null;
  windows: { shipWindow: number; confirmWindow: number; disputeWindow: number; sellerResponseSeconds: number };
}

interface AuditEntry {
  ts: string;
  dealCode: string;
  outcome: "REFUND" | "RELEASE" | "ESCALATE";
  verdictHash: string;
}

interface DashboardResponse {
  spotlight: Spotlight | null;
  recent: { dealCode: string; title: string; priceIDRX: string; listingPhoto: string | null }[];
  auditLog: AuditEntry[];
}

function evidenceUrl(name: string): string {
  return `/api/evidence/${name}`;
}

function dealPageUrl(code: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (base) return `${base.replace(/\/$/, "")}/d/${code}`;
  if (typeof window !== "undefined") return `${window.location.origin}/d/${code}`;
  return `/d/${code}`;
}

export default function PanggungPage() {
  return (
    <Suspense fallback={<div className="card">Memuat…</div>}>
      <PanggungInner />
    </Suspense>
  );
}

function PanggungInner() {
  const dealParam = useSearchParams().get("deal");
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const qs = dealParam ? `?deal=${encodeURIComponent(dealParam)}` : "";
        const res = await fetch(`/api/dashboard${qs}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        setData(await res.json());
      } catch {
        // koneksi putus sesaat — biarkan, poll berikutnya coba lagi
      }
    }
    poll();
    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [dealParam]);

  useEffect(() => {
    if (!data?.spotlight) {
      setQr(null);
      return;
    }
    QRCode.toDataURL(dealPageUrl(data.spotlight.deal.dealCode), { width: 280, margin: 2 }).then(setQr);
  }, [data?.spotlight?.deal.dealCode]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "var(--bg)", color: "var(--ink)", overflow: "auto", padding: "28px 40px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 20 }}>
        <span className="brand" style={{ fontSize: 34 }}>
          <span className="brand-mark" style={{ width: 42, height: 42, fontSize: 22 }}>⚖️</span>
          Rekber AI
        </span>
        <span style={{ color: "var(--ink-soft)", fontSize: 18 }}>escrow non-custodial — AI hakim sengketa</span>
      </div>

      {!data && <div className="card">Memuat…</div>}

      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {data.spotlight ? <SpotlightCard s={data.spotlight} /> : <div className="card">Belum ada transaksi.</div>}
            <DecisionFeed entries={data.auditLog} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card" style={{ textAlign: "center" }}>
              <p className="card-title" style={{ fontSize: 20 }}>Scan buat coba</p>
              {qr && <img src={qr} alt="QR deal demo" style={{ width: "100%", maxWidth: 280, margin: "10px auto", display: "block" }} />}
              {data.spotlight && <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 16 }}>{data.spotlight.deal.dealCode}</p>}
            </div>
            {data.recent.length > 0 && (
              <div className="card">
                <p className="card-title" style={{ fontSize: 16 }}>Transaksi lain</p>
                {data.recent.map((d) => (
                  <div key={d.dealCode} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "6px 0", borderTop: "1px solid var(--border)" }}>
                    <span>{d.title}</span>
                    <span className="bounty">{rupiah(d.priceIDRX)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SpotlightCard({ s }: { s: Spotlight }) {
  const status = s.onchain?.status ?? Status.None;
  const check = s.verdict?.shipmentCheck;
  return (
    <div className="card" style={{ borderColor: "var(--accent)" }}>
      <div style={{ display: "flex", gap: 16 }}>
        {s.deal.spec.listingPhotos[0] && (
          <img src={evidenceUrl(s.deal.spec.listingPhotos[0])} alt={s.deal.spec.title} style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8 }} />
        )}
        <div style={{ flex: 1 }}>
          <p className="card-title" style={{ fontSize: 26 }}>{s.deal.spec.title}</p>
          <p style={{ fontSize: 18, color: "var(--ink-soft)" }}>{rupiah(s.deal.spec.priceIDRX)}</p>
          <p style={{ fontSize: 22, fontWeight: 800, marginTop: 8, color: status >= Status.Released ? "var(--accent)" : "var(--ink)" }}>
            {STATUS_LABEL[status]}
          </p>
        </div>
      </div>

      {check && (
        <p style={{ fontSize: 14, marginTop: 12, color: "var(--ink-soft)" }}>
          Cek AI pengiriman: barang terlihat {check.itemVisible ? "✓" : "✗"}, sesuai janji {check.itemMatchesListing ? "✓" : "✗"}
          {check.warnings.length > 0 && ` — ${check.warnings.join("; ")}`}
        </p>
      )}

      {s.onchain && (
        <div style={{ display: "flex", gap: 20, marginTop: 14, fontSize: 13, color: "var(--ink-soft)" }}>
          <span>Pembeli {shortAddress(s.onchain.buyer)}</span>
          <span>Penjual {shortAddress(s.onchain.seller)}</span>
        </div>
      )}

      {s.verdict?.commit && s.verdict.commit.outcome !== "ESCALATE" && (
        <div style={{ marginTop: 14, fontSize: 15 }}>
          <p style={{ fontWeight: 700 }}>
            {OUTCOME_ICON[s.verdict.commit.outcome]} {s.verdict.commit.outcome} · confidence {(s.verdict.commit.confidence * 100).toFixed(0)}%
          </p>
          <ul className="criteria">
            {s.verdict.commit.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function DecisionFeed({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="card">
      <p className="card-title" style={{ fontSize: 16 }}>Feed keputusan AI</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
        {entries.map((e, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "6px 0", borderTop: "1px solid var(--border)" }}>
            <span>{OUTCOME_ICON[e.outcome]} {e.dealCode} — {e.outcome}</span>
            <span style={{ color: "var(--ink-soft)" }}>{new Date(e.ts).toLocaleTimeString("id-ID")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
