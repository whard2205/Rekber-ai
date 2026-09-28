"use client";

/**
 * Layar panggung ("mata agent") untuk Demo Day — disorot proyektor.
 * Kiri: goal, task cards live, activity feed keputusan agent.
 * Kanan: QR besar untuk penonton jadi worker.
 * Full-screen overlay agar lolos dari max-width mobile layout utama.
 */
import { useEffect, useState } from "react";
import { rupiah, explorerTxUrl, shortAddress } from "@/lib/format";

const STATUS_LABEL: Record<number, { text: string; bg: string; fg: string }> = {
  1: { text: "MENCARI PEKERJA", bg: "var(--accent-bg)", fg: "var(--accent-ink)" },
  2: { text: "SEDANG DIKERJAKAN", bg: "var(--border)", fg: "var(--ink)" },
  3: { text: "🧠 AI MEMVERIFIKASI", bg: "var(--accent-bg)", fg: "var(--accent-ink)" },
  4: { text: "✓ DIBAYAR", bg: "var(--ok-bg)", fg: "var(--ok)" },
  5: { text: "REFUND", bg: "var(--fail-bg)", fg: "var(--fail)" },
};

interface DashTask {
  taskId: string;
  title: string;
  bounty: string;
  status: number;
  challenge: string | null;
  worker: string;
  payoutTxHash: string | null;
}

interface AuditEntry {
  ts: string;
  taskId: string;
  worker: string;
  txHash: string;
  decision: "APPROVE" | "REJECT";
  confidence: number;
  reasons: string[];
}

interface DashData {
  goal: string | null;
  tasks: DashTask[];
  audit: AuditEntry[];
  url: string;
  qr: string;
}

export default function PanggungPage() {
  const [data, setData] = useState<DashData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/dashboard", { cache: "no-store" });
        if (!res.ok) return;
        const d = await res.json();
        if (!cancelled) setData(d);
      } catch {
        /* poll berikutnya */
      }
    }
    load();
    const interval = setInterval(load, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
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
            ⛑️
          </span>
          MANDOR
        </span>
        <span style={{ color: "var(--ink-soft)", fontSize: 15 }}>
          human execution & proof layer — agent live view
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: 28 }}>
        {/* kolom kiri: misi + task + feed */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card">
            <p className="card-meta" style={{ margin: 0 }}>
              Goal yang diberikan ke agent
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 700 }}>
              {data?.goal ?? "Menunggu misi..."}
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {data?.tasks.map((t) => {
              const s = STATUS_LABEL[t.status] ?? STATUS_LABEL[1];
              return (
                <div key={t.taskId} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <p className="card-title" style={{ margin: 0 }}>
                      #{t.taskId} {t.title}
                    </p>
                    <span className="pill" style={{ background: s.bg, color: s.fg, whiteSpace: "nowrap" }}>
                      {s.text}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
                    <span className="bounty">{rupiah(t.bounty)}</span>
                    {t.challenge && t.status !== 4 && (
                      <span
                        style={{
                          fontFamily: "ui-monospace, monospace",
                          fontWeight: 800,
                          fontSize: 15,
                          letterSpacing: "0.06em",
                        }}
                      >
                        🔐 {t.challenge}
                      </span>
                    )}
                  </div>
                  {t.status === 4 && (
                    <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--ink-soft)" }}>
                      → {shortAddress(t.worker)}
                      {t.payoutTxHash && explorerTxUrl(t.payoutTxHash) && (
                        <>
                          {" · "}
                          <a href={explorerTxUrl(t.payoutTxHash)!} target="_blank" rel="noreferrer">
                            lihat tx
                          </a>
                        </>
                      )}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="card" style={{ flex: 1, minHeight: 180 }}>
            <p className="card-title" style={{ fontSize: 14 }}>
              🧠 Keputusan agent (audit trail — live)
            </p>
            {(!data || data.audit.length === 0) && (
              <p className="card-meta">Belum ada keputusan verifikasi.</p>
            )}
            {data?.audit.map((a, i) => (
              <div
                key={i}
                style={{
                  padding: "8px 0",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  fontSize: 14,
                }}
              >
                <span style={{ fontWeight: 700, color: a.decision === "APPROVE" ? "var(--ok)" : "var(--fail)" }}>
                  {a.decision === "APPROVE" ? "✅ APPROVE" : "❌ REJECT"}
                </span>
                <span style={{ color: "var(--ink-soft)" }}>
                  {" "}
                  · task #{a.taskId} · confidence {a.confidence.toFixed(2)} ·{" "}
                  {new Date(a.ts).toLocaleTimeString("id-ID")}
                </span>
                <div style={{ color: "var(--ink-soft)", fontSize: 13, marginTop: 2 }}>
                  {a.reasons.join("; ")}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* kolom kanan: QR */}
        <div className="card" style={{ textAlign: "center", height: "fit-content" }}>
          <p style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800 }}>
            Jadi karyawan AI sekarang
          </p>
          <p className="card-meta">Scan → kerjakan → dibayar IDRX on-chain</p>
          {data ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.qr} alt="QR menuju aplikasi worker" style={{ width: "100%", borderRadius: 12 }} />
          ) : (
            <div style={{ height: 320 }} />
          )}
          <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 14, color: "var(--ink-soft)" }}>
            {data?.url}
          </p>
        </div>
      </div>
    </div>
  );
}
