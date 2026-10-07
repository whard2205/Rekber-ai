"use client";

/** Halaman jualan (docs/rekber-ai/PLAN.md §3.6 "/jual"):
 * form barang → 1–3 foto → checklist AI (bisa diedit, fallback manual) → susun spec +
 * specHash → tandatangani Offer → publish → link transaksi, QR, tombol WhatsApp, dan
 * tombol ke halaman deal.
 *
 * Client wajib mencocokkan setiap nama file bukti yang dikembalikan server dengan
 * keccak256 bytes hasil resizenya sendiri (§3.6 "alur bukti yang ditandatangani"). */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import {
  type Address,
  type Hex,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getOrCreateWallet } from "@/lib/wallet";
import { expectedEvidenceName, resizeForUpload } from "@/lib/image";
import {
  OFFER_TYPES,
  rekberDomain,
  signatureDeadline,
} from "@/lib/eip712";
import { computeSpecHash, dealIdFor, type Spec } from "@/lib/spec";
import { rupiah, shortAddress } from "@/lib/format";

const OFFER_VALID_SECONDS = 30 * 24 * 60 * 60; // 30 hari (§3.3)

interface Photo {
  /** Nama file bukti dari server = `<keccak tanpa 0x>.<ext>` */
  name: string;
  /** Hash client-side, untuk verifikasi nama server (debug display saja). */
  clientHash: string;
  preview: string;
}

interface ChecklistResult {
  checklist: string[];
  warnings: string[];
}

type Step = "form" | "checklist" | "publishing" | "done";

export default function JualPage() {
  const [wallet, setWallet] = useState<{ address: Address; privateKey: `0x${string}` } | null>(null);
  const [step, setStep] = useState<Step>("form");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState(""); // rupiah utuh sebagai string
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deal, setDeal] = useState<{ code: string; url: string } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const w = getOrCreateWallet();
    setWallet(w);
  }, []);

  const reset = useCallback(() => {
    setStep("form");
    setPhotos([]);
    setChecklist([]);
    setWarnings([]);
    setError(null);
    setDeal(null);
    setQrDataUrl(null);
  }, []);

  async function hashFile(file: File): Promise<{ bytes: Uint8Array; hash: string }> {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    return { bytes, hash: keccak256(bytes) };
  }

  /** Upload satu foto: resize → hash client-side → upload → cocokkan nama file server
   * dengan hash sendiri. Tolak kalau tidak cocok (bukti yang disimpan = bukti yang
   * ditandatangani). */
  async function uploadPhoto(raw: File): Promise<Photo> {
    const resized = await resizeForUpload(raw);
    const { hash } = await hashFile(resized);
    const expectedName = expectedEvidenceName(hash, resized);

    const form = new FormData();
    form.append("files", resized, resized.name);
    const res = await fetch("/api/evidence", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Upload foto gagal");
    const names: string[] = data.files;
    if (names.length !== 1) throw new Error("Upload foto gagal — coba lagi");
    if (names[0] !== expectedName) {
      // Server menyimpan foto lain dari yang kita kirim — tolak, jangan pakai.
      throw new Error("Nama file bukti dari server tidak cocok dengan foto Anda — upload dibatalkan");
    }
    return {
      name: expectedName,
      clientHash: hash,
      preview: URL.createObjectURL(resized),
    };
  }

  async function onPickFiles(filesList: FileList | null) {
    if (!filesList) return;
    const incoming = Array.from(filesList);
    if (photos.length + incoming.length > 3) {
      setError("Maksimum 3 foto barang");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const added: Photo[] = [];
      for (const f of incoming) {
        added.push(await uploadPhoto(f));
      }
      setPhotos((p) => [...p, ...added]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload foto gagal");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /** Validasi sisi client sebelum memanggil AI (server memvalidasi ulang). */
  function validateForm(): string | null {
    if (!wallet) return "Wallet belum siap — muat ulang halaman";
    if (title.trim().length < 3) return "Nama barang minimal 3 karakter";
    if (!/^\d+$/.test(price.trim())) return "Harga harus angka Rupiah utuh, mis. 8500000";
    if (description.trim().length < 10) return "Deskripsi minimal 10 karakter";
    if (photos.length === 0) return "Minimal 1 foto barang";
    if (photos.length > 3) return "Maksimum 3 foto barang";
    return null;
  }

  /** Bagi 1: minta kode transaksi baru + jalankan AI checklist secara paralel. */
  async function onToChecklist() {
    const err = validateForm();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const [newRes, checklistRes] = await Promise.all([
        fetch("/api/deals/new", { method: "POST" }),
        fetch("/api/checklist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim(), description: description.trim() }),
        }),
      ]);
      const newJson = await newRes.json();
      if (!newRes.ok) throw new Error(newJson.error ?? "Gagal membuat kode transaksi");
      const clJson = await checklistRes.json();
      if (!checklistRes.ok) throw new Error(clJson.error ?? "Gagal membuat checklist");
      const cl = clJson as ChecklistResult;
      setChecklist(cl.checklist.length ? cl.checklist : ["[MOCK] checklist manual"]);
      setWarnings(cl.warnings ?? []);
      setDealCode(newJson.dealCode as string);
      setStep("checklist");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat checklist");
    } finally {
      setBusy(false);
    }
  }

  const [dealCode, setDealCode] = useState<string>("");

  /** Bagi 2: susun spec canonical, hitung specHash, tandatangani Offer, publish. */
  async function onPublish() {
    if (!wallet) return;
    if (checklist.filter((c) => c.trim()).length === 0) {
      setError("Checklist minimal 1 poin");
      return;
    }
    setError(null);
    setBusy(true);
    setStep("publishing");
    try {
      const spec: Spec = {
        dealCode,
        seller: wallet.address,
        title: title.trim(),
        priceIDRX: price.trim(),
        description: description.trim(),
        checklist: checklist.filter((c) => c.trim()),
        listingPhotos: photos.map((p) => p.name),
      };
      const specHash = computeSpecHash(spec);
      const dealId = dealIdFor(dealCode);
      const offerDeadline = BigInt(Math.floor(Date.now() / 1000) + OFFER_VALID_SECONDS);

      const signer = privateKeyToAccount(wallet.privateKey);
      const sig = (await signer.signTypedData({
        domain: rekberDomain,
        types: OFFER_TYPES,
        primaryType: "Offer",
        message: {
          dealId,
          seller: wallet.address,
          amount: BigInt(spec.priceIDRX),
          specHash,
          deadline: offerDeadline,
        },
      })) as Hex;

      const res = await fetch(`/api/deals/${dealCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, spec, offer: { deadline: Number(offerDeadline), sig } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal mempublikasi transaksi");

      const url = dealPageUrl(dealCode);
      setDeal({ code: dealCode, url });
      setQrDataUrl(await QRCode.toDataURL(url, { width: 240, margin: 2 }));
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mempublikasi transaksi");
      setStep("checklist");
    } finally {
      setBusy(false);
    }
  }

  function dealPageUrl(code: string): string {
    const base = process.env.NEXT_PUBLIC_APP_URL;
    if (base) return `${base.replace(/\/$/, "")}/d/${code}`;
    if (typeof window !== "undefined") return `${window.location.origin}/d/${code}`;
    return `/d/${code}`;
  }

  function waShareText(code: string): string {
    const url = dealPageUrl(code);
    return `Halo, saya jual *${title.trim() || "barang"}* seharga *${rupiah(price.trim())}* lewat Rekber AI. Pembayaran aman di kontrak pintar, AI jadi hakim kalau ada sengketa:%0A%0A${url}`;
  }

  if (!wallet) {
    return <div className="card">Menyiapkan wallet…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <section className="hero" style={{ paddingTop: 8 }}>
        <h1 style={{ fontSize: 26 }}>Buat transaksi</h1>
        <p>
          Tulis barangnya sejujur foto yang akan kamu kirim — itu yang nanti dicek AI kalau ada komplain.
          Setelah ini kamu dapat link untuk dibagikan ke pembeli.
        </p>
        <p className="mono" style={{ fontSize: 12, marginTop: 8 }}>Wallet penjual: {shortAddress(wallet.address)}</p>
      </section>

      {error && <div className="alert alert-fail">{error}</div>}

      {step !== "done" && (
        <div className="card">
          <h2 className="card-title">Detail barang</h2>

          <label style={labelStyle}>Nama barang</label>
          <input
            style={inputStyle}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="mis. iPhone 13 128GB Hitam"
            disabled={busy}
          />

          <label style={{ ...labelStyle, marginTop: 10 }}>Harga (Rupiah utuh)</label>
          <input
            style={inputStyle}
            value={price}
            inputMode="numeric"
            onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="mis. 8500000"
            disabled={busy}
          />
          {price && /^\d+$/.test(price) && (
            <div style={{ fontSize: 13, marginTop: 4, color: "var(--ink-soft)" }}>{rupiah(price)}</div>
          )}

          <label style={{ ...labelStyle, marginTop: 10 }}>Deskripsi & kondisi</label>
          <textarea
            style={{ ...inputStyle, minHeight: 84, resize: "vertical" }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={"mis. iPhone 13 128GB hitam, masa pakai 1 tahun, baterai 92%, tidak ada retak, dus + kabel ada."}
            disabled={busy}
          />

          <label style={{ ...labelStyle, marginTop: 10 }}>Foto barang (1–3)</label>
          <input
            ref={fileRef}
            className="file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(e) => onPickFiles(e.target.files)}
            disabled={busy}
          />
          {photos.map((p, i) => (
            <div key={p.name} style={{ position: "relative", marginTop: 10 }}>
              <img className="preview" src={p.preview} alt={`Foto barang ${i + 1}`} />
              <button
                onClick={() => setPhotos((arr) => arr.filter((x) => x.name !== p.name))}
                disabled={busy}
                style={removeBtnStyle}
                aria-label={`Hapus foto ${i + 1}`}
              >
                ✕
              </button>
              <div style={{ fontSize: 11, color: "var(--ink-soft)", wordBreak: "break-all" }}>
                bukti: {p.name.slice(0, 16)}….{p.name.slice(-8)}
              </div>
            </div>
          ))}
          {busy && step === "form" && <div style={{ marginTop: 10, fontSize: 13 }}>Upload foto…</div>}

          {step === "form" && (
            <button className="btn" onClick={onToChecklist} disabled={busy}>
              {busy ? "Menunggu AI…" : "Buat janji penjual (AI)"}
            </button>
          )}
        </div>
      )}

      {step === "checklist" && (
        <div className="card">
          <h2 className="card-title">Janji penjual (checklist)</h2>
          <p className="card-meta">
            Poin objektif yang bisa dicek dari foto. AI hanya membantu menulis — Anda yang
            menanggung janji ini, jadi periksa dan edit sebelum lanjut.
          </p>
          {warnings.map((w, i) => (
            <div key={i} className="alert alert-fail" style={{ marginBottom: 8 }}>
              {w}
            </div>
          ))}
          {checklist.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                style={inputStyle}
                value={c}
                onChange={(e) =>
                  setChecklist((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))
                }
                disabled={busy}
              />
              <button
                onClick={() => setChecklist((arr) => arr.filter((_, j) => j !== i))}
                disabled={busy}
                style={removeBtnStyle}
                aria-label={`Hapus poin ${i + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            className="btn btn-secondary"
            onClick={() => setChecklist((arr) => [...arr, ""])}
            disabled={busy}
          >
            + Tambah poin
          </button>
          <button className="btn" onClick={onPublish} disabled={busy}>
            {busy ? "Menandatangani & publish…" : "Buat link transaksi"}
          </button>
        </div>
      )}

      {step === "done" && deal && (
        <div className="card">
          <h2 className="card-title">Link transaksi siap</h2>
          <p className="card-meta">
            Bagikan link ini ke pembeli. Dana baru cair ke Anda setelah pembeli konfirmasi
            atau AI/arbiter memutuskan untuk Anda.
          </p>

          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 14, wordBreak: "break-all" }}>
            {deal.url}
          </div>

          {qrDataUrl && (
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <img src={qrDataUrl} alt="QR code link transaksi" style={{ width: 240, height: 240 }} />
              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>Pindai untuk buka transaksi</div>
            </div>
          )}

          <a
            className="btn btn-secondary"
            href={`https://wa.me/?text=${waShareText(deal.code)}`}
            target="_blank"
            rel="noreferrer"
          >
            Bagikan ke WhatsApp
          </a>
          <Link className="btn" href={`/d/${deal.code}`}>
            Buka halaman transaksi
          </Link>
          <button className="btn btn-secondary" onClick={reset}>
            Jual barang lain
          </button>
        </div>
      )}
    </div>
  );
}

const labelStyle = {
  display: "block",
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 4,
} as const;

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1.5px solid var(--border)",
  background: "var(--surface)",
  color: "var(--ink)",
  fontSize: 15,
  outline: "none",
} as const;

const removeBtnStyle = {
  position: "absolute",
  top: 8,
  right: 8,
  width: 28,
  height: 28,
  borderRadius: 999,
  border: "none",
  background: "var(--fail)",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
} as const;
