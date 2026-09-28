import { NextResponse } from "next/server";
import { readDeal, writeDeal } from "@/lib/deals";
import { badAddress, badDeadline, badSigOrEmpty, asAddress, asHex } from "@/lib/validation";
import { verifyFund } from "@/lib/verify";
import { fundWithSig, translateChainError, type OfferTerms } from "@/lib/chain";
import type { Hex } from "viem";

export const dynamic = "force-dynamic";

interface FundBody {
  buyer?: unknown;
  fundDeadline?: unknown;
  fundSig?: unknown;
  permitDeadline?: unknown;
  permitSig?: unknown;
}

/** POST /api/deals/[code]/fund — pembeli mendanai deal lewat relayer (docs/rekber-ai/PLAN.md
 * §3.6). Terms (Offer) diambil dari deal file yang tersimpan, BUKAN dari body request —
 * pembeli hanya menandatangani Fund (buyer+seller+amount+specHash+fundDeadline), relayer
 * tidak bisa mengubah harga karena itu sudah dikunci di Offer penjual. */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const deal = readDeal(code);
  if (!deal || !deal.spec.listingPhotos.length) {
    return NextResponse.json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
  }
  if (deal.txs.fund) {
    return NextResponse.json({ error: "Transaksi ini sudah dibayar" }, { status: 409 });
  }

  const body = (await req.json().catch(() => null)) as FundBody | null;
  if (!body) return NextResponse.json({ error: "Body harus JSON" }, { status: 400 });
  const { buyer, fundDeadline, fundSig, permitDeadline, permitSig } = body;

  const errBuyer = badAddress(buyer);
  if (errBuyer) return NextResponse.json({ error: errBuyer }, { status: 400 });
  const errFundDeadline = badDeadline(fundDeadline);
  if (errFundDeadline) return NextResponse.json({ error: errFundDeadline }, { status: 400 });
  if (typeof fundSig !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(fundSig)) {
    return NextResponse.json({ error: "Format tanda tangan Fund tidak valid" }, { status: 400 });
  }
  const errPermitDeadline = badDeadline(permitDeadline);
  if (errPermitDeadline) return NextResponse.json({ error: errPermitDeadline }, { status: 400 });
  const errPermitSig = badSigOrEmpty(permitSig);
  if (errPermitSig) return NextResponse.json({ error: errPermitSig }, { status: 400 });

  const buyerAddr = asAddress(buyer as string);
  const sellerAddr = asAddress(deal.spec.seller);
  const amount = BigInt(deal.spec.priceIDRX);
  const specHash = asHex(deal.specHash);
  const dealId = asHex(deal.dealId);

  try {
    await verifyFund({
      dealId,
      buyer: buyerAddr,
      seller: sellerAddr,
      amount,
      specHash,
      deadline: BigInt(fundDeadline as number),
      sig: asHex(fundSig as string),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Verifikasi Fund gagal" }, { status: 400 });
  }

  const terms: OfferTerms = {
    dealId,
    seller: sellerAddr,
    amount,
    specHash,
    offerDeadline: BigInt(deal.offer.deadline),
  };

  try {
    const receipt = await fundWithSig(
      terms,
      buyerAddr,
      BigInt(fundDeadline as number),
      asHex(deal.offer.sig),
      asHex(fundSig as string),
      BigInt(permitDeadline as number),
      (permitSig as string) as Hex,
    );
    deal.txs.fund = receipt.transactionHash;
    writeDeal(deal);
    return NextResponse.json({ txHash: receipt.transactionHash });
  } catch (err) {
    return NextResponse.json({ error: translateChainError(err) }, { status: 400 });
  }
}
