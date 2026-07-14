"use client";

import { useEffect, useState } from "react";
import { getOrCreateWallet } from "@/lib/wallet";
import { rupiah, shortAddress } from "@/lib/format";

interface Payout {
  taskId: string;
  title: string;
  amount: string;
  txHash: string;
}

export default function RiwayatPage() {
  const [wallet, setWallet] = useState<{ address: `0x${string}` } | null>(null);
  const [items, setItems] = useState<Payout[]>([]);
  const [total, setTotal] = useState("0");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setWallet(getOrCreateWallet());
  }, []);

  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    async function load() {
      const res = await fetch(`/api/history?worker=${wallet!.address}`, { cache: "no-store" });
      const data = await res.json();
      if (!cancelled) {
        setItems(data.items ?? []);
        setTotal(data.total ?? "0");
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [wallet]);

  if (!wallet || loading) return <div className="empty">Memuat...</div>;

  return (
    <>
      <div className="card total-earned">
        <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: 13 }}>Total pendapatan dari MANDOR</p>
        <p className="amount">{rupiah(total)}</p>
        <p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)" }}>Wallet: {shortAddress(wallet.address)}</p>
      </div>

      {items.length === 0 ? (
        <div className="empty">Belum ada gaji yang cair. Selesaikan kerjaan pertamamu!</div>
      ) : (
        items.map((it, i) => (
          <div key={i} className="card">
            <p className="card-title" style={{ fontSize: 14 }}>
              {it.title}
            </p>
            <span className="pill pill-ok">{rupiah(it.amount)} — DIBAYAR</span>
          </div>
        ))
      )}
    </>
  );
}
