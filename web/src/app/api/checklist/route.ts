import { NextResponse } from "next/server";
import { extractChecklist } from "@/lib/ai";

export const dynamic = "force-dynamic";

const MAX_TITLE = 120;
const MAX_DESCRIPTION = 4000;

/** POST /api/checklist — {title, description} → checklist AI (docs/rekber-ai/PLAN.md §3.6,
 * provider §3.4a). AI gagal → fallback tetap mengembalikan checklist (bukan error): penjual
 * mengetik/mengedit manual di UI. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body harus JSON" }, { status: 400 });
  }
  const { title, description } = body as Record<string, unknown>;
  if (typeof title !== "string" || title.trim().length < 3) {
    return NextResponse.json({ error: "Nama barang minimal 3 karakter" }, { status: 400 });
  }
  if (typeof description !== "string" || description.trim().length < 10) {
    return NextResponse.json({ error: "Deskripsi minimal 10 karakter" }, { status: 400 });
  }
  if (title.length > MAX_TITLE || description.length > MAX_DESCRIPTION) {
    return NextResponse.json({ error: "Teks terlalu panjang" }, { status: 400 });
  }

  const result = await extractChecklist(title.trim(), description.trim());
  return NextResponse.json(result);
}
