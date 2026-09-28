"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getOrCreateWallet } from "@/lib/wallet";
import { rupiah, explorerTxUrl } from "@/lib/format";

const Status = { Open: 1, Claimed: 2, Submitted: 3, Paid: 4, Refunded: 5 } as const;

interface TaskDetail {
  taskId: string;
  spec: {
    title: string;
    instructions: string;
    acceptanceCriteria: string[];
    bountyIDRX: number;
    challenge?: string;
  };
  bounty: string;
  status: number;
  worker: string;
  lastVerdict: { decision: "APPROVE" | "REJECT"; reasons: string[]; confidence: number } | null;
  payoutTxHash: string | null;
}

const MAX_UPLOAD_DIMENSION = 2000;

/** O-05: foto HP bisa 5-8 MB, di atas batas praktis untuk upload cepat + API vision.
 * Downscale sisi terpanjang ke 2000px lewat <canvas> native (kode tantangan tetap
 * terbaca) sebelum upload. Jatuh balik ke file asli kalau resize gagal (browser lama,
 * gagal decode) — server tetap menolak file yang kebesaran sebagai jaring pengaman. */
function resizeForUpload(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(img.width, img.height));
      if (scale === 1) {
        resolve(file);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : file),
        "image/jpeg",
        0.85,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

function TxLink({ hash, label }: { hash: string; label: string }) {
  const url = explorerTxUrl(hash);
  if (!url) return null;
  return (
    <p style={{ fontSize: 12, margin: "6px 0 0" }}>
      <a href={url} target="_blank" rel="noreferrer">
        🔗 {label}: {hash.slice(0, 14)}...
      </a>
    </p>
  );
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
  const [claimTx, setClaimTx] = useState<string | null>(null);
  const [submitTx, setSubmitTx] = useState<string | null>(null);
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
      setClaimTx(data.txHash);
      setRejected(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) {
      setError("Ukuran foto asli terlalu besar (maks 20 MB)");
      return;
    }
    setError(null);
    const resized = await resizeForUpload(f);
    if (resized.size > 6 * 1024 * 1024) {
      setError("Ukuran foto maksimal 6 MB setelah dikompres, coba foto lain");
      return;
    }
    setFile(resized);
    setPreview(URL.createObjectURL(resized));
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
      setSubmitTx(data.txHash);
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
  const rejectReasons =
    task.lastVerdict?.decision === "REJECT" ? task.lastVerdict.reasons : [];

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

      {task.spec.challenge && task.status !== Status.Paid && (
        <div className="card" style={{ borderColor: "var(--accent)", background: "var(--accent-bg)" }}>
          <p className="card-title" style={{ fontSize: 13, color: "var(--accent-ink)" }}>
            🔐 Kode tantangan — tulis di kertas/layar dan ikutkan di fotomu
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "0.08em",
              color: "var(--accent-ink)",
              fontFamily: "ui-monospace, monospace",
            }}
          >
            {task.spec.challenge}
          </p>
          <p className="card-meta" style={{ margin: "6px 0 0" }}>
            Ini bukti fotomu diambil khusus untuk task ini — foto lama akan ditolak AI.
          </p>
        </div>
      )}

      {error && <div className="alert alert-fail">{error}</div>}
      {rejected && task.status === Status.Open && (
        <div className="alert alert-fail">
          ❌ Bukti sebelumnya ditolak AI.
          {rejectReasons.length > 0 && (
            <ul className="criteria" style={{ color: "inherit", marginTop: 6 }}>
              {rejectReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
          Ambil lagi dan coba sekali lagi dengan foto baru.
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
          {claimTx && <TxLink hash={claimTx} label="Tx claim" />}
        </div>
      )}

      {task.status === Status.Claimed && !isMine && (
        <div className="alert alert-fail">Kerjaan ini sedang dikerjakan orang lain.</div>
      )}

      {task.status === Status.Submitted && isMine && (
        <div className="alert" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
          <span className="spin">🧠</span> AI sedang memverifikasi bukti kamu...
          {submitTx && <TxLink hash={submitTx} label="Tx bukti" />}
        </div>
      )}

      {task.status === Status.Paid && isMine && (
        <div className="alert alert-ok">
          ✅ Lulus! {rupiah(task.bounty)} sudah dikirim ke wallet kamu.
          {task.payoutTxHash && <TxLink hash={task.payoutTxHash} label="Tx gaji" />}
        </div>
      )}
    </>
  );
}
