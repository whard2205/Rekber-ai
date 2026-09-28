import { NextResponse } from "next/server";
import { readDeal, writeDeal, computeDisputeHash } from "@/lib/deals";
import { badAddress, badDeadline, asAddress, asHex } from "@/lib/validation";
import { evidenceExists } from "@/lib/evidence";
import { verifyAct } from "@/lib/verify";
import { act, translateChainError } from "@/lib/chain";
import { Action } from "@/lib/eip712";

export const dynamic = "force-dynamic";

interface DisputeBody {
  photos?: unknown;
  complaint?: unknown;
  buyer?: unknown;
  deadline?: unknown;
  sig?: unknown;
}

const MAX_COMPLAINT = 2000;

/** POST /api/deals/[code]/dispute — pembeli komplain dengan bukti (docs/rekber-ai/PLAN.md
 * §3.6). Ini yang memicu hakim AI (agent, R-06) begitu tanggapan penjual ada/lewat batas
 * waktu — web sendiri tidak menilai apa pun, cuma mencatat sengketa on-chain. */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const deal = readDeal(code);
  if (!deal || !deal.spec.listingPhotos.length) {
    return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
  }
  if (!deal.txs.ship) return NextResponse.json({ error: "Penjual belum mengirim bukti pengiriman" }, { status: 409 });
  if (deal.txs.dispute) return NextResponse.json({ error: "Sengketa sudah diajukan untuk transaksi ini" }, { status: 409 });
  if (deal.txs.confirm) return NextResponse.json({ error: "Transaksi ini sudah dikonfirmasi" }, { status: 409 });

  const body = (await req.json().catch(() => null)) as DisputeBody | null;
  if (!body) return NextResponse.json({ error: "Body harus JSON" }, { status: 400 });
  const { photos, complaint, buyer, deadline, sig } = body;

  if (!Array.isArray(photos) || photos.length === 0 || photos.some((p) => typeof p !== "string")) {
    return NextResponse.json({ error: "Foto unboxing wajib diunggah (minimal 1)" }, { status: 400 });
  }
  if (typeof complaint !== "string" || complaint.trim().length < 5) {
    return NextResponse.json({ error: "Jelaskan masalahnya (minimal 5 karakter)" }, { status: 400 });
  }
  if (complaint.length > MAX_COMPLAINT) {
    return NextResponse.json({ error: "Keluhan terlalu panjang" }, { status: 400 });
  }
  const errBuyer = badAddress(buyer);
  if (errBuyer) return NextResponse.json({ error: errBuyer }, { status: 400 });
  const errDeadline = badDeadline(deadline);
  if (errDeadline) return NextResponse.json({ error: errDeadline }, { status: 400 });
  if (typeof sig !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(sig)) {
    return NextResponse.json({ error: "Format tanda tangan tidak valid" }, { status: 400 });
  }

  const missing = (photos as string[]).filter((p) => !evidenceExists(p));
  if (missing.length > 0) {
    return NextResponse.json({ error: `Bukti belum di-upload atau tidak valid: ${missing.join(", ")}` }, { status: 400 });
  }

  const disputeHash = computeDisputeHash({ photos: photos as string[], complaint: complaint.trim() });

  try {
    await verifyAct({
      dealId: asHex(deal.dealId),
      action: Action.Dispute,
      data: disputeHash,
      deadline: BigInt(deadline as number),
      sig: asHex(sig as string),
      signer: asAddress(buyer as string),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Verifikasi gagal" }, { status: 400 });
  }

  try {
    const receipt = await act(asHex(deal.dealId), Action.Dispute, disputeHash, BigInt(deadline as number), asHex(sig as string));
    deal.dispute = {
      photos: photos as string[],
      complaint: complaint.trim(),
      disputeHash,
      submittedAt: new Date().toISOString(),
    };
    deal.txs.dispute = receipt.transactionHash;
    writeDeal(deal);
    return NextResponse.json({ txHash: receipt.transactionHash });
  } catch (err) {
    return NextResponse.json({ error: translateChainError(err) }, { status: 400 });
  }
}
