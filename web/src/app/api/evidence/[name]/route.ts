import { NextResponse } from "next/server";
import { EVIDENCE_NAME_RE, evidencePath } from "@/lib/evidence";

/** GET /api/evidence/[name] — sajikan file bukti (nama = hash isi, jadi nama sudah
 * memvalidasi integritas; R-09 memakai ini untuk thumbnail di /d/[code] dan /panggung). */
export const dynamic = "force-dynamic";

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  // Nama harus persis <64 hex>.<ext> — jaring pengaman terhadap path traversal (mis.
  // "../../.env") lewat parameter dinamis, sebelum path itu sampai ke fs.
  if (!EVIDENCE_NAME_RE.test(name)) return new NextResponse("Nama file tidak valid", { status: 400 });
  const ext = name.split(".").pop();
  const mime = ext ? MIME_BY_EXT[ext] : undefined;
  if (!mime) return new NextResponse("Format tidak didukung", { status: 400 });

  let bytes: Buffer;
  try {
    bytes = await import("node:fs/promises").then((fs) => fs.readFile(evidencePath(name)));
  } catch {
    return new NextResponse("Bukti tidak ditemukan", { status: 404 });
  }
  return new NextResponse(bytes, { headers: { "Content-Type": mime, "Cache-Control": "public, max-age=3600" } });
}
