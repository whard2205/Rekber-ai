"use client";

/**
 * Layar panggung untuk Demo Day — disorot proyektor.
 * Kiri: deal aktif terbaru (timeline besar, thumbnail bukti, label cek pengiriman),
 *       feed keputusan AI (dari audit log).
 * Kanan: QR besar ke deal demo (?deal=RKB-… di URL, default deal terbaru).
 *
 * Versi MANDOR (dashboard task + /api/dashboard) dihapus di R-07; tampilan deal
 * Rekber AI dibangun di R-10. GET /api/deals/[code] sudah siap di bawahnya.
 */
import { useEffect, useState } from "react";

interface PanggungPlaceholder {
  url: string;
}

export default function PanggungPage() {
  const [data, setData] = useState<PanggungPlaceholder | null>(null);

  useEffect(() => {
    // NEXT_PUBLIC_APP_URL kosong = deteksi IP LAN (dipakai untuk QR deal demo di R-10).
    setData({ url: process.env.NEXT_PUBLIC_APP_URL || "" });
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "var(--bg)",
        color: "var(--ink)",
        overflow: "auto",
        padding: "28px 36px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 18 }}>
        <span className="brand" style={{ fontSize: 30 }}>
          <span className="brand-mark" style={{ width: 38, height: 38, fontSize: 20 }}>
            ⚖️
          </span>
          Rekber AI
        </span>
        <span style={{ color: "var(--ink-soft)", fontSize: 15 }}>
          escrow non-custodial — AI hakim sengketa
        </span>
      </div>

      <div className="card" style={{ textAlign: "center" }}>
        <p style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800 }}>
          Layar panggung Rekber AI
        </p>
        <p className="card-meta">
          Timeline deal live + feed keputusan AI + QR deal demo — dibangun di R-10.
        </p>
        {data?.url && (
          <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 14, color: "var(--ink-soft)" }}>
            {data.url}
          </p>
        )}
      </div>
    </div>
  );
}
