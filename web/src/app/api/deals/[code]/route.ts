import { NextResponse } from "next/server";
import { readDeal } from "@/lib/deals";
import { getDeal, getWindows } from "@/lib/chain";
import { readVerdict } from "@/lib/verdicts";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const deal = readDeal(code);
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
    verdict: readVerdict(code),
    windows: { ...windows, sellerResponseSeconds: config.sellerResponseSeconds },
  });
}
