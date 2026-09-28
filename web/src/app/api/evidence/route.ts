import { NextResponse } from "next/server";
import path from "node:path";
import { keccak256 } from "viem";
import { evidencePath, extForMime, validateEvidenceBlob } from "@/lib/evidence";

export const dynamic = "force-dynamic";

const MAX_FILES = 3;

/** POST /api/evidence — multipart 1–3 foto → simpan di data/evidence/ (docs/rekber-ai/PLAN.md
 * §3.6). Nama file = keccak256(isi) → content-addressed; upload isi yang sama dua kali
 * menimpa file yang sama (dedup, BUKAN error 409). Client wajib mencocokkan setiap nama
 * file yang dikembalikan dengan keccak256 bytes miliknya sendiri. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Request harus multipart/form-data" }, { status: 400 });

  const files = form.getAll("files").filter((v): v is File => v instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "Tidak ada file yang dikirim" }, { status: 400 });
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Maksimum ${MAX_FILES} foto per upload` }, { status: 400 });
  }

  const saved: string[] = [];
  for (const file of files) {
    const sizeErr = validateEvidenceBlob(file);
    if (sizeErr) return NextResponse.json({ error: `${file.name}: ${sizeErr}` }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const hash = keccak256(bytes); // content-addressed
    const ext = extForMime(file.type);
    if (!ext) return NextResponse.json({ error: `${file.name}: format tidak didukung` }, { status: 400 });
    const name = `${hash.slice(2)}.${ext}`;
    // Dedup: nama menentukan isi, menulis ulang isi yang sama = no-op.
    await fsWrite(evidencePath(name), bytes);
    saved.push(name);
  }

  return NextResponse.json({ files: saved });
}

async function fsWrite(p: string, bytes: Uint8Array): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, bytes);
}
