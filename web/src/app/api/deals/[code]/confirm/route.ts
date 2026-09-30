import { NextResponse } from "next/server";
import { readDeal, writeDeal } from "@/lib/deals";
import { badAddress, badDeadline, asAddress, asHex } from "@/lib/validation";
import { verifyAct } from "@/lib/verify";
import { act, translateChainError } from "@/lib/chain";
import { Action } from "@/lib/eip712";

export const dynamic = "force-dynamic";

interface ConfirmBody {
  buyer?: unknown;
  deadline?: unknown;
  sig?: unknown;
}

/** POST /api/deals/[code]/confirm — pembeli menerima barang sesuai janji: dana cair
 * langsung ke penjual, tanpa AI (docs/rekber-ai/PLAN.md §3.6). */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const deal = await readDeal(code);
  if (!deal || !deal.spec.listingPhotos.length) {
    return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
  }
  if (!deal.txs.ship) return NextResponse.json({ error: "Penjual belum mengirim bukti pengiriman" }, { status: 409 });
  if (deal.txs.confirm) return NextResponse.json({ error: "Transaksi ini sudah dikonfirmasi" }, { status: 409 });

  const body = (await req.json().catch(() => null)) as ConfirmBody | null;
  if (!body) return NextResponse.json({ error: "Body harus JSON" }, { status: 400 });
  const { buyer, deadline, sig } = body;

  const errBuyer = badAddress(buyer);
  if (errBuyer) return NextResponse.json({ error: errBuyer }, { status: 400 });
  const errDeadline = badDeadline(deadline);
  if (errDeadline) return NextResponse.json({ error: errDeadline }, { status: 400 });
  if (typeof sig !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(sig)) {
    return NextResponse.json({ error: "Format tanda tangan tidak valid" }, { status: 400 });
  }

  const ZERO_HASH = `0x${"0".repeat(64)}` as const;
  try {
    await verifyAct({
      dealId: asHex(deal.dealId),
      action: Action.Confirm,
      data: ZERO_HASH,
      deadline: BigInt(deadline as number),
      sig: asHex(sig as string),
      signer: asAddress(buyer as string),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Verifikasi gagal" }, { status: 400 });
  }

  try {
    const receipt = await act(asHex(deal.dealId), Action.Confirm, ZERO_HASH, BigInt(deadline as number), asHex(sig as string));
    deal.txs.confirm = receipt.transactionHash;
    await writeDeal(deal);
    return NextResponse.json({ txHash: receipt.transactionHash });
  } catch (err) {
    return NextResponse.json({ error: translateChainError(err) }, { status: 400 });
  }
}
