import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { keccak256 } from "viem";
import { getTask, Status, submitProofFor, translateChainError } from "@/lib/chain";
import { config } from "@/lib/config";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
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
  await writeFile(path.join(config.uploadsDir, filename), bytes);

  try {
    const receipt = await submitProofFor(taskId, worker as `0x${string}`, proofHash);
    return NextResponse.json({ proofHash, txHash: receipt.transactionHash });
  } catch (err) {
    return NextResponse.json({ error: translateChainError(err) }, { status: 400 });
  }
}
