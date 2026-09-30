import { NextResponse } from "next/server";
import {
  computeSpecHash,
  dealIdFor,
  readDeal,
  writeDeal,
  type DealRecord,
  type Spec,
} from "@/lib/deals";
import { badAddress, badBytes32, badOfferPayload, badSpec, badSpecMatch, asAddress, asHex } from "@/lib/validation";
import { missingEvidence } from "@/lib/evidence";
import { verifyOffer } from "@/lib/verify";
import { getDeal, getWindows } from "@/lib/chain";
import { readVerdict } from "@/lib/verdicts";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

interface PublishBody {
  dealId?: unknown;
  spec?: unknown;
  offer?: unknown;
}

/** POST /api/deals/[code] — publikasi janji penjual (docs/rekber-ai/PLAN.md §3.6):
 * 1. spec divalidasi & dealId/spec cocok dengan code+seller
 * 2. semua listingPhotos harus ada di data/evidence/
 * 3. server menghitung ulang specHash (canonical, urutan key §3.3) — tidak mempercayai
 *    specHash dari client
 * 4. sig diverifikasi = Offer dari spec.seller atas (dealId, seller, amount, specHash,
 *    deadline) — anti-squatting §3.2
 * 5. tulis deal file */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const body = (await req.json().catch(() => null)) as PublishBody | null;
  if (!body) return NextResponse.json({ error: "Body harus JSON" }, { status: 400 });
  const { dealId, spec, offer: offerRaw } = body;

  const errDealId = badBytes32(dealId);
  if (errDealId) return NextResponse.json({ error: errDealId }, { status: 400 });
  const errOffer = badOfferPayload(offerRaw);
  if (errOffer) return NextResponse.json({ error: errOffer }, { status: 400 });
  const errSpec = badSpec(spec);
  if (errSpec) return NextResponse.json({ error: errSpec }, { status: 400 });

  const specTyped = spec as Spec;
  const offer = offerRaw as { deadline: number; sig: string };

  const expectedDealId = dealIdFor(code);
  if (expectedDealId !== (dealId as string)) {
    return NextResponse.json({ error: "dealId tidak cocok dengan kode transaksi" }, { status: 400 });
  }

  const errAddr = badAddress(specTyped.seller);
  if (errAddr) return NextResponse.json({ error: errAddr }, { status: 400 });
  const matchErr = badSpecMatch(specTyped, code, asAddress(specTyped.seller));
  if (matchErr) return NextResponse.json({ error: matchErr }, { status: 400 });

  // 1. Bukti foto harus benar-benar ada di server (nama = hash isi file, file ada)
  const missing = await missingEvidence(specTyped.listingPhotos as string[]);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Foto bukti belum di-upload atau tidak valid: ${missing.join(", ")}` },
      { status: 400 },
    );
  }

  // 2. Canonical specHash — dihitung server dari spec yang divalidasi, bukan dari client
  const specHash = computeSpecHash(specTyped);

  // 3. Verifikasi tanda tangan Offer (anti-squatting §3.2). Verify throw Error Bahasa
  // Indonesia yang aman ditampilkan ke pengguna.
  try {
    await verifyOffer({
      dealId: asHex(dealId as string),
      seller: asAddress(specTyped.seller),
      amount: BigInt(specTyped.priceIDRX),
      specHash,
      deadline: BigInt(offer.deadline),
      sig: asHex(offer.sig),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Verifikasi tanda tangan gagal" },
      { status: 400 },
    );
  }

  // 4. Kode sudah dipublikasi/bayar → tolak publish ulang (deal file = satu penulis)
  const existing = await readDeal(code);
  if (existing && (existing.txs.fund || existing.spec.listingPhotos.length > 0)) {
    return NextResponse.json(
      { error: existing.txs.fund ? "Transaksi sudah dibayar — tidak bisa publish ulang" : "Janji penjual sudah dipublikasi untuk kode ini" },
      { status: 409 },
    );
  }

  const record: DealRecord = {
    dealCode: code,
    dealId: dealId as string,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    seller: specTyped.seller,
    spec: specTyped,
    specHash,
    offer: { deadline: offer.deadline, sig: offer.sig },
    txs: existing?.txs ?? {},
  };
  await writeDeal(record);

  return NextResponse.json({ dealCode: code, dealId: record.dealId, specHash });
}

/** GET /api/deals/[code] — deal file + state on-chain + verdict + jendela waktu (§3.6). */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const deal = await readDeal(code);
  if (!deal) return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });

  const [onchain, windows] = await Promise.all([
    deal.txs.fund ? getDeal(deal.dealId as `0x${string}`) : null,
    getWindows(),
  ]);

  return NextResponse.json({
    deal,
    onchain: onchain && {
      status: onchain.status,
      buyer: onchain.buyer,
      seller: onchain.seller,
      amount: onchain.amount.toString(),
      fundedAt: onchain.fundedAt,
      shippedAt: onchain.shippedAt,
      disputedAt: onchain.disputedAt,
      verdictHash: onchain.verdictHash,
    },
    verdict: await readVerdict(code),
    windows: { ...windows, sellerResponseSeconds: config.sellerResponseSeconds },
  });
}
