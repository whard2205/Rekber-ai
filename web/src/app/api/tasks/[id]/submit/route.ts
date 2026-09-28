import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { keccak256 } from "viem";
import { getTask, Status, submitProofFor, translateChainError } from "@/lib/chain";
import { config } from "@/lib/config";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
// O-05: foto sudah di-resize di browser (task/[id]/page.tsx handleFile), jadi batas ini
// hanya jaring pengaman terakhir — turunkan dari 8 ke 6 MB (default MAX_PROOF_BASE64_CHARS
// di agent/src/verifier.ts adalah 8 MB biner, sisakan headroom).
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 6) * 1024 * 1024;
const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const taskId = BigInt(id);

  const form = await req.formData();
  const worker = form.get("workerAddress");
  const file = form.get("photo");

  if (typeof worker !== "string" || !ADDRESS_RE.test(worker)) {
    return NextResponse.json({ error: "workerAddress tidak valid" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Foto bukti wajib diunggah" }, { status: 400 });
  }
  const ext = MIME_EXT[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Format foto harus JPEG, PNG, atau WebP" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Ukuran foto maksimal ${MAX_UPLOAD_BYTES / 1024 / 1024} MB` },
      { status: 413 },
    );
  }

  const onchain = await getTask(taskId);
  if (onchain.status !== Status.Claimed) {
    return NextResponse.json({ error: "Task ini belum di-claim atau bukti sudah pernah dikirim" }, { status: 409 });
  }
  if (onchain.worker.toLowerCase() !== worker.toLowerCase()) {
    return NextResponse.json({ error: "Task ini di-claim oleh alamat lain" }, { status: 403 });
  }

  // proofHash = keccak256 dari isi file — dipakai kontrak sebagai bukti on-chain,
  // dan sebagai nama file di uploads/ (lihat agent/src/proof-store.ts).
  const bytes = new Uint8Array(await file.arrayBuffer());
  const proofHash = keccak256(bytes);
  const filename = proofHash.slice(2) + ext;
  const filePath = path.join(config.uploadsDir, filename);

  // Anti-daur-ulang lapis pertama: byte identik = hash identik = file sudah ada.
  // (Agent masih punya registry lintas-task sebagai lapis kedua.)
  if (existsSync(filePath)) {
    return NextResponse.json(
      { error: "Foto ini sudah pernah dipakai. Ambil foto baru dengan kode tantangan terlihat." },
      { status: 409 },
    );
  }
  await writeFile(filePath, bytes);

  try {
    const receipt = await submitProofFor(taskId, worker as `0x${string}`, proofHash);
    return NextResponse.json({ proofHash, txHash: receipt.transactionHash });
  } catch (err) {
    // O-05: tx gagal setelah file ditulis -> hapus, supaya retry dengan foto yang
    // sama tidak kena 409 "sudah pernah dipakai" secara palsu.
    await unlink(filePath).catch(() => {});
    return NextResponse.json({ error: translateChainError(err) }, { status: 400 });
  }
}
