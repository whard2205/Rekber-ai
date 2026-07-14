"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getOrCreateWallet } from "@/lib/wallet";
import { rupiah } from "@/lib/format";

const Status = { Open: 1, Claimed: 2, Submitted: 3, Paid: 4, Refunded: 5 } as const;

interface TaskDetail {
  taskId: string;
  spec: { title: string; instructions: string; acceptanceCriteria: string[]; bountyIDRX: number };
  bounty: string;
  status: number;
  worker: string;
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [wallet, setWallet] = useState<{ address: `0x${string}` } | null>(null);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const prevStatus = useRef<number | null>(null);
  const prevWorker = useRef<string | null>(null);

  useEffect(() => {
    setWallet(getOrCreateWallet());
  }, []);

  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    async function load() {
      const res = await fetch(`/api/tasks/${id}`, { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const data: TaskDetail = await res.json();
      if (cancelled) return;

      const wasSubmittedByMe =
        prevStatus.current === Status.Submitted &&
        prevWorker.current?.toLowerCase() === wallet!.address.toLowerCase();
      if (wasSubmittedByMe && data.status === Status.Open) setRejected(true);

      prevStatus.current = data.status;
      prevWorker.current = data.worker;
      setTask(data);
    }
    load();
    const interval = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id, wallet]);

  async function handleClaim() {
    if (!wallet) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerAddress: wallet.address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengambil kerjaan");
      setRejected(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function handleSubmit() {
    if (!wallet || !file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("workerAddress", wallet.address);
      form.append("photo", file);
      const res = await fetch(`/api/tasks/${id}/submit`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengirim bukti");
      setFile(null);
      setPreview(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!task || !wallet) return <div className="empty">Memuat...</div>;

  const isMine = task.worker.toLowerCase() === wallet.address.toLowerCase();

  return (
    <>
      <div className="card">
        <p className="card-title">{task.spec.title}</p>
        <p className="card-meta">{task.spec.instructions}</p>
        <ul className="criteria">
          {task.spec.acceptanceCriteria.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
        <div style={{ marginTop: 12 }}>
          <span className="bounty">{rupiah(task.bounty)}</span>
        </div>
      </div>

      {error && <div className="alert alert-fail">{error}</div>}
      {rejected && task.status === Status.Open && (
        <div className="alert alert-fail">
          ❌ Bukti sebelumnya ditolak AI — kriteria belum terpenuhi. Ambil lagi dan coba sekali lagi.
        </div>
      )}

      {task.status === Status.Open && (
        <button className="btn" disabled={busy} onClick={handleClaim}>
          {busy ? "Memproses..." : "Ambil Kerjaan Ini"}
        </button>
      )}

      {task.status === Status.Claimed && isMine && (
        <div className="card">
          <p className="card-title" style={{ fontSize: 14 }}>
            Unggah bukti foto
          </p>
          <label className="file-input">
            {file ? file.name : "📷 Ketuk untuk ambil/pilih foto"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={handleFile}
              style={{ display: "none" }}
            />
          </label>
          {preview && <img src={preview} alt="Preview bukti" className="preview" />}
          <button className="btn" disabled={busy || !file} onClick={handleSubmit}>
            {busy ? "Mengirim..." : "Kirim Bukti"}
          </button>
        </div>
      )}

      {task.status === Status.Claimed && !isMine && (
        <div className="alert alert-fail">Kerjaan ini sedang dikerjakan orang lain.</div>
      )}

      {task.status === Status.Submitted && isMine && (
        <div className="alert" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
          <span className="spin">🧠</span> AI sedang memverifikasi bukti kamu...
        </div>
      )}

      {task.status === Status.Paid && isMine && (
        <div className="alert alert-ok">✅ Lulus! {rupiah(task.bounty)} sudah dikirim ke wallet kamu.</div>
      )}
    </>
  );
}
