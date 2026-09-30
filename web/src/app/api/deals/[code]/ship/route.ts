import { NextResponse } from "next/server";
import { readDeal, writeDeal, computeShipmentHash } from "@/lib/deals";
import { badAddress, badDeadline, asAddress, asHex } from "@/lib/validation";
import { missingEvidence } from "@/lib/evidence";
import { verifyAct } from "@/lib/verify";
import { act, translateChainError } from "@/lib/chain";
import { Action } from "@/lib/eip712";

export const dynamic = "force-dynamic";

interface ShipBody {
  packingPhotos?: unknown;
  resiPhoto?: unknown;
  resiText?: unknown;
  seller?: unknown;
  deadline?: unknown;
  sig?: unknown;
}

/** POST /api/deals/[code]/ship — penjual mengirim barang + bukti (docs/rekber-ai/PLAN.md
 * §3.6). Foto sudah diupload lewat /api/evidence sebelumnya; di sini cuma referensinya. */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const deal = await readDeal(code);
  if (!deal || !deal.spec.listingPhotos.length) {
    return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
  }
  if (!deal.txs.fund) return NextResponse.json({ error: "Transaksi belum dibayar" }, { status: 409 });
  if (deal.txs.ship) return NextResponse.json({ error: "Bukti pengiriman sudah dikirim" }, { status: 409 });

  const body = (await req.json().catch(() => null)) as ShipBody | null;
  if (!body) return NextResponse.json({ error: "Body harus JSON" }, { status: 400 });
  const { packingPhotos, resiPhoto, resiText, seller, deadline, sig } = body;

  if (!Array.isArray(packingPhotos) || packingPhotos.length === 0 || packingPhotos.some((p) => typeof p !== "string")) {
    return NextResponse.json({ error: "Foto packing wajib diunggah (minimal 1)" }, { status: 400 });
  }
  if (resiPhoto !== null && typeof resiPhoto !== "string") {
    return NextResponse.json({ error: "Foto resi tidak valid" }, { status: 400 });
  }
  if (typeof resiText !== "string") {
    return NextResponse.json({ error: "Teks resi tidak valid" }, { status: 400 });
  }
  const errSeller = badAddress(seller);
  if (errSeller) return NextResponse.json({ error: errSeller }, { status: 400 });
  const errDeadline = badDeadline(deadline);
  if (errDeadline) return NextResponse.json({ error: errDeadline }, { status: 400 });
  if (typeof sig !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(sig)) {
    return NextResponse.json({ error: "Format tanda tangan tidak valid" }, { status: 400 });
  }
  if ((seller as string).toLowerCase() !== deal.spec.seller.toLowerCase()) {
    return NextResponse.json({ error: "Hanya penjual transaksi ini yang bisa mengirim bukti" }, { status: 403 });
  }

  const missing = await missingEvidence([...packingPhotos, ...(resiPhoto ? [resiPhoto] : [])] as string[]);
  if (missing.length > 0) {
    return NextResponse.json({ error: `Bukti belum di-upload atau tidak valid: ${missing.join(", ")}` }, { status: 400 });
  }

  const shipmentHash = computeShipmentHash({
    packingPhotos: packingPhotos as string[],
    resiPhoto: (resiPhoto as string | null) ?? null,
    resiText: resiText as string,
  });

  try {
    await verifyAct({
      dealId: asHex(deal.dealId),
      action: Action.Ship,
      data: shipmentHash,
      deadline: BigInt(deadline as number),
      sig: asHex(sig as string),
      signer: asAddress(deal.spec.seller),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Verifikasi gagal" }, { status: 400 });
  }

  try {
    const receipt = await act(asHex(deal.dealId), Action.Ship, shipmentHash, BigInt(deadline as number), asHex(sig as string));
    deal.shipment = {
      packingPhotos: packingPhotos as string[],
      resiPhoto: (resiPhoto as string | null) ?? null,
      resiText: resiText as string,
      shipmentHash,
      submittedAt: new Date().toISOString(),
    };
    deal.txs.ship = receipt.transactionHash;
    await writeDeal(deal);
    return NextResponse.json({ txHash: receipt.transactionHash });
  } catch (err) {
    return NextResponse.json({ error: translateChainError(err) }, { status: 400 });
  }
}
