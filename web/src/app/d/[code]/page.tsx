"use client";

/** Halaman transaksi `/d/[code]` — alur penuh (docs/rekber-ai/PLAN.md §3.6):
 * bayar (permit + Fund) → kirim (Ship) → konfirmasi (Confirm) / komplain (Dispute) →
 * tanggapan penjual (Respond, off-chain) → putusan (Released/Refunded/Split).
 * UI menyesuaikan peran: penjual (spec.seller === wallet), pembeli (onchain.buyer ===
 * wallet), atau pengamat. Satu wallet burner bisa jadi penjual di satu deal dan pembeli
 * di deal lain — peran ditentukan per halaman, bukan per akun. */
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { keccak256, toHex, type Address, type Hex } from "viem";
import { getOrCreateWallet } from "@/lib/wallet";
import { expectedEvidenceName, resizeForUpload } from "@/lib/image";
import { rupiah, explorerTxUrl, shortAddress } from "@/lib/format";
import { rekberDomain, permitDomain, FUND_TYPES, ACT_TYPES, PERMIT_TYPES, Action, signatureDeadline } from "@/lib/eip712";
import { privateKeyToAccount } from "viem/accounts";
import type { Spec } from "@/lib/spec";

const Status = { None: 0, Funded: 1, Shipped: 2, Disputed: 3, Escalated: 4, Released: 5, Refunded: 6, Split: 7 } as const;
const STATUS_LABEL: Record<number, string> = {
  [Status.Funded]: "Dibayar",
  [Status.Shipped]: "Dikirim",
  [Status.Disputed]: "Sengketa",
  [Status.Escalated]: "Dieskalasi ke arbiter manusia",
  [Status.Released]: "Selesai — dana cair ke penjual",
  [Status.Refunded]: "Selesai — dana dikembalikan ke pembeli",
  [Status.Split]: "Selesai — dana dibagi 50/50",
};

interface OnchainDeal {
  status: number;
  buyer: Address;
  seller: Address;
  amount: string;
  fundedAt: number;
  shippedAt: number;
  disputedAt: number;
  verdictHash: Hex;
}

interface DealRecord {
  dealCode: string;
  dealId: string;
  seller: string;
  spec: Spec;
  specHash: string;
  offer: { deadline: number; sig: string };
  shipment?: { packingPhotos: string[]; resiPhoto: string | null; resiText: string; shipmentHash: string; submittedAt: string };
  dispute?: { photos: string[]; complaint: string; disputeHash: string; submittedAt: string };
  sellerResponse?: { photos: string[]; text: string; responseHash: string; respondedAt: string };
  txs: { fund?: string; ship?: string; confirm?: string; dispute?: string };
}

interface ShipmentCheck {
  dealCodeVisible: boolean;
  itemVisible: boolean;
  itemMatchesListing: boolean;
  resiReadable: boolean;
  courier: string | null;
  resiNumber: string | null;
  warnings: string[];
  model: string;
}

interface VerdictCommit {
  dealId: string;
  dealCode: string;
  outcome: "REFUND" | "RELEASE" | "ESCALATE";
  confidence: number;
  reasons: string[];
  evidence: { specHash: string; shipmentHash: string | null; disputeHash: string | null; responseHash: string | null };
  model: string;
  decidedAt: string;
}

interface VerdictFile {
  shipmentCheck?: ShipmentCheck;
  commit?: VerdictCommit;
  verdictHash?: Hex;
  txHash?: string;
}

interface ApiResponse {
  deal: DealRecord;
  onchain: OnchainDeal | null;
  verdict: VerdictFile | null;
  windows: { shipWindow: number; confirmWindow: number; disputeWindow: number; sellerResponseSeconds: number };
}

type Wallet = { address: Address; privateKey: Hex };

function evidenceUrl(name: string): string {
  return `/api/evidence/${name}`;
}

/** Hitung hash bukti PERSIS seperti server (viem, urutan key sama) — dipakai client
 * untuk membangun objek yang ditandatangani DAN untuk validasi nama file upload. */
async function hashFile(file: File): Promise<Hex> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return keccak256(bytes);
}

async function uploadEvidence(files: File[]): Promise<string[]> {
  const resized = await Promise.all(files.map((f) => resizeForUpload(f)));
  const hashes = await Promise.all(resized.map(hashFile));
  const expected = resized.map((f, i) => expectedEvidenceName(hashes[i], f));
  const form = new FormData();
  resized.forEach((f) => form.append("files", f, f.name));
  const res = await fetch("/api/evidence", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Upload foto gagal");
  const names: string[] = data.files;
  if (names.length !== expected.length || names.some((n, i) => n !== expected[i])) {
    throw new Error("Nama file bukti dari server tidak cocok dengan foto Anda — upload dibatalkan");
  }
  return names;
}

export default function DealPage() {
  const { code } = useParams<{ code: string }>();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWallet(getOrCreateWallet());
  }, []);

  const load = useCallback(async () => {
    if (!code) return;
    const res = await fetch(`/api/deals/${code}`, { cache: "no-store" });
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    if (!res.ok) return;
    setData((await res.json()) as ApiResponse);
  }, [code]);

  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    async function tick() {
      await load();
      if (!cancelled) {
        const t = setTimeout(tick, 3000);
        return t;
      }
    }
    const timer = setTimeout(tick, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [wallet, load]);

  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    async function loadBalance() {
      const res = await fetch(`/api/balance?owner=${wallet!.address}`, { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const j = await res.json();
      setBalance(BigInt(j.balance));
    }
    loadBalance();
    const interval = setInterval(loadBalance, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [wallet, data?.deal.txs.fund]);

  if (notFound) {
    return (
      <div className="card">
        <h1 className="card-title">Transaksi tidak ditemukan</h1>
        <p className="card-meta">Kode transaksi {code} belum ada atau belum dipublikasi.</p>
      </div>
    );
  }
  if (!wallet || !data) {
    return <div className="empty">Memuat…</div>;
  }

  const { deal, onchain, verdict, windows } = data;
  const signer = privateKeyToAccount(wallet.privateKey);
  const isSeller = wallet.address.toLowerCase() === deal.spec.seller.toLowerCase();
  const isBuyer = !!onchain && wallet.address.toLowerCase() === onchain.buyer.toLowerCase();
  const price = BigInt(deal.spec.priceIDRX);

  async function signAct(action: 0 | 1 | 2, dataHash: Hex): Promise<{ deadline: bigint; sig: Hex }> {
    const deadline = signatureDeadline();
    const sig = await signer.signTypedData({
      domain: rekberDomain,
      types: ACT_TYPES,
      primaryType: "Act",
      message: { dealId: deal.dealId as Hex, action, data: dataHash, deadline },
    });
    return { deadline, sig };
  }

  async function handleFaucet() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: wallet!.address }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Klaim saldo demo gagal");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Klaim saldo demo gagal");
    } finally {
      setBusy(false);
    }
  }

  async function handleFund() {
    setError(null);
    setBusy(true);
    try {
      const fundDeadline = signatureDeadline();
      const fundSig = await signer.signTypedData({
        domain: rekberDomain,
        types: FUND_TYPES,
        primaryType: "Fund",
        message: {
          dealId: deal.dealId as Hex,
          buyer: wallet!.address,
          seller: deal.spec.seller as Address,
          amount: price,
          specHash: deal.specHash as Hex,
          deadline: fundDeadline,
        },
      });

      const nonceRes = await fetch(`/api/permit-nonce?owner=${wallet!.address}`);
      const { nonce } = await nonceRes.json();
      const permitDeadline = signatureDeadline();
      const permitSig = await signer.signTypedData({
        domain: permitDomain,
        types: PERMIT_TYPES,
        primaryType: "Permit",
        message: {
          owner: wallet!.address,
          spender: process.env.NEXT_PUBLIC_ESCROW_ADDRESS as Address,
          value: price,
          nonce: BigInt(nonce),
          deadline: permitDeadline,
        },
      });

      const res = await fetch(`/api/deals/${code}/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyer: wallet!.address,
          fundDeadline: Number(fundDeadline),
          fundSig,
          permitDeadline: Number(permitDeadline),
          permitSig,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Pembayaran gagal");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pembayaran gagal");
    } finally {
      setBusy(false);
    }
  }

  async function handleShip(packingFiles: File[], resiFile: File | null, resiText: string) {
    setError(null);
    setBusy(true);
    try {
      const packingPhotos = await uploadEvidence(packingFiles);
      const resiPhoto = resiFile ? (await uploadEvidence([resiFile]))[0] : null;
      const shipmentHashInput = { packingPhotos, resiPhoto, resiText };
      const shipmentHash = keccak256(toHex(JSON.stringify(shipmentHashInput)));
      const { deadline, sig } = await signAct(Action.Ship, shipmentHash);

      const res = await fetch(`/api/deals/${code}/ship`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packingPhotos, resiPhoto, resiText, seller: wallet!.address, deadline: Number(deadline), sig }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Gagal mengirim bukti pengiriman");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim bukti pengiriman");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    setError(null);
    setBusy(true);
    try {
      const ZERO = `0x${"0".repeat(64)}` as Hex;
      const { deadline, sig } = await signAct(Action.Confirm, ZERO);
      const res = await fetch(`/api/deals/${code}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyer: wallet!.address, deadline: Number(deadline), sig }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Konfirmasi gagal");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Konfirmasi gagal");
    } finally {
      setBusy(false);
    }
  }

  async function handleDispute(photoFiles: File[], complaint: string) {
    setError(null);
    setBusy(true);
    try {
      const photos = await uploadEvidence(photoFiles);
      const disputeHash = keccak256(toHex(JSON.stringify({ photos, complaint })));
      const { deadline, sig } = await signAct(Action.Dispute, disputeHash);
      const res = await fetch(`/api/deals/${code}/dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos, complaint, buyer: wallet!.address, deadline: Number(deadline), sig }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Gagal mengirim komplain");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim komplain");
    } finally {
      setBusy(false);
    }
  }

  async function handleRespond(photoFiles: File[], text: string) {
    setError(null);
    setBusy(true);
    try {
      const photos = photoFiles.length ? await uploadEvidence(photoFiles) : [];
      const responseHash = keccak256(toHex(JSON.stringify({ photos, text })));
      const sig = await signer.signMessage({ message: { raw: responseHash } });
      const res = await fetch(`/api/deals/${code}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos, text, seller: wallet!.address, sig }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Gagal mengirim tanggapan");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim tanggapan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="card">
        {deal.spec.listingPhotos[0] && (
          <img className="preview" src={evidenceUrl(deal.spec.listingPhotos[0])} alt={deal.spec.title} style={{ marginBottom: 10 }} />
        )}
        <p className="card-title">{deal.spec.title}</p>
        <p className="card-meta">Kode transaksi: {deal.dealCode}</p>
        <span className="bounty">{rupiah(deal.spec.priceIDRX)}</span>
        <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 10 }}>{deal.spec.description}</p>
        <ul className="criteria">
          {deal.spec.checklist.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </div>

      <Timeline deal={deal} onchain={onchain} windows={windows} />

      {error && <div className="alert alert-fail">{error}</div>}

      {!onchain && !isSeller && (
        <PayCard
          price={price}
          balance={balance}
          busy={busy}
          onFaucet={handleFaucet}
          onFund={handleFund}
        />
      )}
      {!onchain && isSeller && (
        <div className="card">
          <p className="card-meta">Menunggu pembeli membayar. Bagikan link ini ke pembeli.</p>
        </div>
      )}

      {onchain?.status === Status.Funded && isSeller && <ShipCard dealCode={deal.dealCode} busy={busy} onShip={handleShip} />}
      {onchain?.status === Status.Funded && !isSeller && (
        <div className="card">
          <p className="card-meta">Menunggu penjual mengirim barang + bukti.</p>
        </div>
      )}

      {onchain?.status === Status.Shipped && isBuyer && (
        <ShippedCard dealCode={deal.dealCode} verdict={verdict} busy={busy} onConfirm={handleConfirm} onDispute={handleDispute} />
      )}
      {onchain?.status === Status.Shipped && !isBuyer && (
        <div className="card">
          <p className="card-meta">Menunggu pembeli konfirmasi atau komplain.</p>
        </div>
      )}

      {onchain?.status === Status.Disputed && isSeller && !deal.sellerResponse && (
        <RespondCard busy={busy} onRespond={handleRespond} />
      )}
      {onchain?.status === Status.Disputed && (!isSeller || deal.sellerResponse) && (
        <div className="card">
          <p className="card-title" style={{ fontSize: 14 }}>Sengketa sedang diproses</p>
          <p className="card-meta">{deal.dispute?.complaint}</p>
          {deal.sellerResponse && (
            <>
              <p className="card-title" style={{ fontSize: 13, marginTop: 10 }}>Tanggapan penjual</p>
              <p className="card-meta">{deal.sellerResponse.text}</p>
            </>
          )}
          <p className="card-meta" style={{ marginTop: 8 }}>Menunggu putusan AI…</p>
        </div>
      )}

      {onchain?.status === Status.Escalated && (
        <div className="alert" style={{ background: "var(--accent-bg)", color: "var(--accent-ink)" }}>
          AI ragu memutus — sengketa dilempar ke arbiter manusia. Mohon tunggu.
        </div>
      )}

      {onchain && isFinal(onchain.status) && (
        <FinalBanner onchain={onchain} verdict={verdict} />
      )}
    </div>
  );
}

function isFinal(status: number): boolean {
  return status === Status.Released || status === Status.Refunded || status === Status.Split;
}

function fmtCountdown(deadlineSec: number): string {
  const remain = deadlineSec - Math.floor(Date.now() / 1000);
  if (remain <= 0) return "batas waktu lewat";
  const m = Math.floor(remain / 60);
  const s = remain % 60;
  return `${m}m ${s}s lagi`;
}

function Timeline({ deal, onchain, windows }: { deal: DealRecord; onchain: OnchainDeal | null; windows: ApiResponse["windows"] }) {
  const steps: { label: string; done: boolean; tx?: string; countdown?: string }[] = [
    { label: "Dibuat", done: true },
    { label: "Dibayar", done: !!onchain, tx: deal.txs.fund },
    { label: "Dikirim", done: (onchain?.status ?? 0) >= Status.Shipped, tx: deal.txs.ship },
    {
      label: onchain?.status === Status.Disputed || deal.txs.dispute ? "Sengketa" : "Dikonfirmasi",
      done: (onchain?.status ?? 0) >= Status.Disputed,
      tx: deal.txs.dispute ?? deal.txs.confirm,
    },
    { label: "Putusan", done: !!onchain && isFinal(onchain.status) },
  ];
  if (onchain?.status === Status.Funded) {
    steps[1].countdown = `Batas kirim: ${fmtCountdown(onchain.fundedAt + windows.shipWindow)}`;
  }
  if (onchain?.status === Status.Shipped) {
    steps[2].countdown = `Batas konfirmasi: ${fmtCountdown(onchain.shippedAt + windows.confirmWindow)}`;
  }
  if (onchain?.status === Status.Disputed) {
    steps[3].countdown = `Batas tanggapan penjual: ${fmtCountdown(onchain.disputedAt + windows.sellerResponseSeconds)}`;
  }

  return (
    <div className="card">
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
            <span style={{ fontWeight: s.done ? 700 : 400, color: s.done ? "var(--ink)" : "var(--ink-soft)" }}>
              {s.done ? "✓" : "○"} {s.label}
            </span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {s.countdown && <span style={{ color: "var(--ink-soft)", fontSize: 12 }}>{s.countdown}</span>}
              {s.tx && <TxLink hash={s.tx} />}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TxLink({ hash }: { hash: string }) {
  const url = explorerTxUrl(hash);
  if (!url) return <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>{hash.slice(0, 10)}…</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>
      tx ↗
    </a>
  );
}

function PayCard({
  price,
  balance,
  busy,
  onFaucet,
  onFund,
}: {
  price: bigint;
  balance: bigint | null;
  busy: boolean;
  onFaucet: () => void;
  onFund: () => void;
}) {
  const enough = balance !== null && balance >= price;
  return (
    <div className="card">
      <p className="card-title" style={{ fontSize: 14 }}>Bayar lewat Rekber AI</p>
      <p className="card-meta">
        Dana akan dikunci di kontrak — tidak ada yang bisa mengambilnya sampai Anda konfirmasi atau AI memutus.
      </p>
      {balance !== null && (
        <p style={{ fontSize: 13, marginBottom: 8 }}>Saldo Anda: {rupiah(balance.toString())}</p>
      )}
      {!enough && (
        <button className="btn btn-secondary" onClick={onFaucet} disabled={busy}>
          {busy ? "Memproses…" : "Isi saldo demo"}
        </button>
      )}
      <button className="btn" onClick={onFund} disabled={busy || !enough}>
        {busy ? "Memproses…" : `Bayar ${rupiah(price.toString())}`}
      </button>
    </div>
  );
}

function ShipCard({ dealCode, busy, onShip }: { dealCode: string; busy: boolean; onShip: (packing: File[], resi: File | null, resiText: string) => void }) {
  const [packing, setPacking] = useState<File[]>([]);
  const [resi, setResi] = useState<File | null>(null);
  const [resiText, setResiText] = useState("");
  return (
    <div className="card">
      <p className="card-title" style={{ fontSize: 14 }}>Kirim barang + bukti</p>
      <div style={{ borderColor: "var(--accent)", background: "var(--accent-bg)", padding: 12, borderRadius: 12, marginBottom: 10 }}>
        <p style={{ fontSize: 12, color: "var(--accent-ink)", margin: 0 }}>
          Foto barangnya (bukan cuma dus) di samping kode ini, ditulis di kertas:
        </p>
        <p style={{ fontSize: 24, fontWeight: 500, letterSpacing: "0.06em", color: "var(--accent-ink)", fontFamily: "var(--font-mono), ui-monospace, monospace", margin: "4px 0 0" }}>
          {dealCode}
        </p>
      </div>
      <label className="file-input">
        {packing.length ? `${packing.length} foto packing dipilih` : "Pilih foto packing (wajib)"}
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: "none" }} onChange={(e) => setPacking(Array.from(e.target.files ?? []))} />
      </label>
      <label className="file-input" style={{ marginTop: 8 }}>
        {resi ? "1 foto resi dipilih" : "Pilih foto resi (opsional)"}
        <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={(e) => setResi(e.target.files?.[0] ?? null)} />
      </label>
      <input
        style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid var(--border)", marginTop: 8 }}
        placeholder="Nomor resi (mis. JNE 012345678)"
        value={resiText}
        onChange={(e) => setResiText(e.target.value)}
      />
      <button className="btn" disabled={busy || packing.length === 0} onClick={() => onShip(packing, resi, resiText)}>
        {busy ? "Mengirim…" : "Kirim bukti pengiriman"}
      </button>
    </div>
  );
}

function ShippedCard({
  dealCode,
  verdict,
  busy,
  onConfirm,
  onDispute,
}: {
  dealCode: string;
  verdict: VerdictFile | null;
  busy: boolean;
  onConfirm: () => void;
  onDispute: (photos: File[], complaint: string) => void;
}) {
  const [disputing, setDisputing] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [complaint, setComplaint] = useState("");
  const check = verdict?.shipmentCheck;

  return (
    <div className="card">
      <p className="card-title" style={{ fontSize: 14 }}>Barang sudah dikirim</p>
      {check && (
        <div className={check.itemVisible ? "alert alert-ok" : "alert alert-fail"} style={{ marginBottom: 10 }}>
          {check.itemVisible ? "Cek AI: barang terlihat di foto packing" : "Cek AI: barang tidak terlihat jelas di foto packing"}
          {check.warnings.length > 0 && (
            <ul className="criteria" style={{ color: "inherit", marginTop: 6 }}>
              {check.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!disputing ? (
        <>
          <button className="btn" disabled={busy} onClick={onConfirm}>
            {busy ? "Memproses…" : "Barang sesuai, cairkan"}
          </button>
          <button className="btn btn-secondary" disabled={busy} onClick={() => setDisputing(true)}>
            Ada masalah
          </button>
        </>
      ) : (
        <>
          <p className="card-meta">
            Foto unboxing dengan kode <b>{dealCode}</b> terlihat, lalu jelaskan masalahnya.
          </p>
          <label className="file-input">
            {photos.length ? `${photos.length} foto dipilih` : "Pilih foto unboxing"}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: "none" }} onChange={(e) => setPhotos(Array.from(e.target.files ?? []))} />
          </label>
          <textarea
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid var(--border)", marginTop: 8, minHeight: 70 }}
            placeholder="Jelaskan masalahnya…"
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
          />
          <button className="btn" disabled={busy || photos.length === 0 || complaint.trim().length < 5} onClick={() => onDispute(photos, complaint.trim())}>
            {busy ? "Mengirim…" : "Kirim komplain"}
          </button>
          <button className="btn btn-secondary" disabled={busy} onClick={() => setDisputing(false)}>
            Batal
          </button>
        </>
      )}
    </div>
  );
}

function RespondCard({ busy, onRespond }: { busy: boolean; onRespond: (photos: File[], text: string) => void }) {
  const [photos, setPhotos] = useState<File[]>([]);
  const [text, setText] = useState("");
  return (
    <div className="card">
      <p className="card-title" style={{ fontSize: 14 }}>Tanggapi komplain pembeli</p>
      <p className="card-meta">AI akan memutus berdasarkan bukti kedua pihak.</p>
      <label className="file-input">
        {photos.length ? `${photos.length} foto dipilih` : "Pilih foto pendukung (opsional)"}
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: "none" }} onChange={(e) => setPhotos(Array.from(e.target.files ?? []))} />
      </label>
      <textarea
        style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid var(--border)", marginTop: 8, minHeight: 70 }}
        placeholder="Tanggapan Anda…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button className="btn" disabled={busy || text.trim().length < 3} onClick={() => onRespond(photos, text.trim())}>
        {busy ? "Mengirim…" : "Kirim tanggapan"}
      </button>
    </div>
  );
}

function FinalBanner({ onchain, verdict }: { onchain: OnchainDeal; verdict: VerdictFile | null }) {
  const [check, setCheck] = useState<{ recomputed: string; matches: boolean } | null>(null);
  const commit = verdict?.commit;

  async function checkHash() {
    if (!commit) return;
    const recomputed = keccak256(toHex(JSON.stringify(commit)));
    setCheck({ recomputed, matches: recomputed.toLowerCase() === onchain.verdictHash.toLowerCase() });
  }

  return (
    <div className="card" style={{ borderColor: "var(--accent)" }}>
      <p className="card-title">{STATUS_LABEL[onchain.status]}</p>
      {commit && commit.outcome !== "ESCALATE" && (
        <>
          <p className="card-meta">Confidence AI: {(commit.confidence * 100).toFixed(0)}%</p>
          <ul className="criteria">
            {commit.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </>
      )}
      {!commit && (
        <p className="card-meta">
          {onchain.status === Status.Split ? "Sengketa tidak diputus tepat waktu — dana dibagi otomatis oleh kontrak." : "Diselesaikan otomatis oleh kontrak."}
        </p>
      )}
      <p style={{ fontSize: 12, fontFamily: "ui-monospace, monospace", wordBreak: "break-all", marginTop: 8 }}>
        verdictHash: {onchain.verdictHash}
      </p>
      {commit && (
        <button className="btn btn-secondary" onClick={checkHash}>
          Cek hash sendiri
        </button>
      )}
      {check && (
        <div className={check.matches ? "alert alert-ok" : "alert alert-fail"} style={{ marginTop: 8 }}>
          {check.matches ? "Cocok: putusan ini sama persis dengan yang tercatat di blockchain." : "Tidak cocok dengan hash di blockchain."}
          <p style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", wordBreak: "break-all", margin: "4px 0 0" }}>
            {check.recomputed}
          </p>
        </div>
      )}
    </div>
  );
}
