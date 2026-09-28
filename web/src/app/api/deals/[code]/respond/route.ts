import { NextResponse } from "next/server";
import { readDeal, writeDeal, computeResponseHash } from "@/lib/deals";
import { asAddress, asHex } from "@/lib/validation";
import { evidenceExists } from "@/lib/evidence";
import { verifySellerResponse } from "@/lib/verify";
import { readVerdict } from "@/lib/verdicts";
import { getDeal, Status } from "@/lib/chain";

export const dynamic = "force-dynamic";

interface RespondBody {
  photos?: unknown;
  text?: unknown;
  seller?: unknown;
  sig?: unknown;
}

const MAX_TEXT = 2000;

/** POST /api/deals/[code]/respond — tanggapan penjual atas sengketa (docs/rekber-ai/PLAN.md
 * §3.6). OFF-CHAIN saja, tidak ada tx — penjual signMessage atas responseHash (bukan typed
 * data, karena tidak berinteraksi dengan kontrak). Hanya diterima selama status on-chain
 * masih Disputed dan hakim AI belum memutus (verdict file belum punya commit) — begitu
 * agent (R-06) memutus, tanggapan telat tidak lagi diterima. */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const deal = readDeal(code);
  if (!deal || !deal.spec.listingPhotos.length) {
    return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
  }
  if (!deal.txs.dispute) return NextResponse.json({ error: "Belum ada sengketa untuk transaksi ini" }, { status: 409 });
  if (deal.sellerResponse) return NextResponse.json({ error: "Tanggapan sudah pernah dikirim" }, { status: 409 });

  const onchain = await getDeal(asHex(deal.dealId));
  if (onchain.status !== Status.Disputed) {
    return NextResponse.json({ error: "Sengketa sudah tidak dalam status yang bisa ditanggapi" }, { status: 409 });
  }
  const verdict = readVerdict(code) as { commit?: unknown } | null;
  if (verdict?.commit) {
    return NextResponse.json({ error: "AI/arbiter sudah memutus — tanggapan tidak bisa dikirim lagi" }, { status: 409 });
  }

  const body = (await req.json().catch(() => null)) as RespondBody | null;
  if (!body) return NextResponse.json({ error: "Body harus JSON" }, { status: 400 });
  const { photos, text, seller, sig } = body;

  if (!Array.isArray(photos) || photos.some((p) => typeof p !== "string")) {
    return NextResponse.json({ error: "Daftar foto tidak valid" }, { status: 400 });
  }
  if (typeof text !== "string" || text.trim().length < 3) {
    return NextResponse.json({ error: "Tanggapan minimal 3 karakter" }, { status: 400 });
  }
  if (text.length > MAX_TEXT) return NextResponse.json({ error: "Tanggapan terlalu panjang" }, { status: 400 });
  if (typeof seller !== "string" || seller.toLowerCase() !== deal.spec.seller.toLowerCase()) {
    return NextResponse.json({ error: "Hanya penjual transaksi ini yang bisa menanggapi" }, { status: 403 });
  }
  if (typeof sig !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(sig)) {
    return NextResponse.json({ error: "Format tanda tangan tidak valid" }, { status: 400 });
  }

  const missing = (photos as string[]).filter((p) => !evidenceExists(p));
  if (missing.length > 0) {
    return NextResponse.json({ error: `Bukti belum di-upload atau tidak valid: ${missing.join(", ")}` }, { status: 400 });
  }

  const responseHash = computeResponseHash({ photos: photos as string[], text: text.trim() });

  try {
    await verifySellerResponse({ responseHash, seller: asAddress(deal.spec.seller), sig: asHex(sig) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Verifikasi gagal" }, { status: 400 });
  }

  deal.sellerResponse = {
    photos: photos as string[],
    text: text.trim(),
    responseHash,
    respondedAt: new Date().toISOString(),
  };
  writeDeal(deal);
  return NextResponse.json({ ok: true });
}
