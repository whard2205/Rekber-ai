import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { listDeals } from "@/lib/deals";
import { getDeal, getWindows, Status } from "@/lib/chain";
import { readVerdict } from "@/lib/verdicts";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

const ACTIVE = new Set<number>([Status.Funded, Status.Shipped, Status.Disputed, Status.Escalated]);

/** GET /api/dashboard — data untuk /panggung (docs/rekber-ai/PLAN.md §3.6/R-10):
 * deal "spotlight" (?deal=RKB-xxx, atau otomatis: transaksi aktif terbaru, lalu transaksi
 * belum dibayar terbaru buat di-QR, lalu transaksi manapun terbaru) + daftar transaksi
 * terbaru + baris terakhir audit-log.jsonl (ditulis agent) buat feed keputusan AI. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const requested = url.searchParams.get("deal");

  const deals = listDeals();
  const withOnchain = await Promise.all(
    deals.slice(0, 20).map(async (d) => ({ deal: d, onchain: d.txs.fund ? await getDeal(d.dealId as `0x${string}`) : null })),
  );

  let spotlight = requested ? withOnchain.find((x) => x.deal.dealCode === requested) : undefined;
  if (!spotlight) {
    spotlight =
      withOnchain.find((x) => x.onchain && ACTIVE.has(x.onchain.status)) ??
      withOnchain.find((x) => !x.onchain) ??
      withOnchain[0];
  }

  const windows = await getWindows();

  return NextResponse.json({
    spotlight: spotlight && {
      deal: spotlight.deal,
      onchain: spotlight.onchain && {
        status: spotlight.onchain.status,
        buyer: spotlight.onchain.buyer,
        seller: spotlight.onchain.seller,
        amount: spotlight.onchain.amount.toString(),
        fundedAt: spotlight.onchain.fundedAt,
        shippedAt: spotlight.onchain.shippedAt,
        disputedAt: spotlight.onchain.disputedAt,
        verdictHash: spotlight.onchain.verdictHash,
      },
      verdict: readVerdict(spotlight.deal.dealCode),
      windows: { ...windows, sellerResponseSeconds: config.sellerResponseSeconds },
    },
    recent: deals.slice(0, 8).map((d) => ({ dealCode: d.dealCode, title: d.spec.title, priceIDRX: d.spec.priceIDRX, listingPhoto: d.spec.listingPhotos[0] ?? null })),
    auditLog: readAuditLogTail(12),
  });
}

function readAuditLogTail(n: number): unknown[] {
  const p = path.join(config.dataDir, "audit-log.jsonl");
  if (!fs.existsSync(p)) return [];
  const lines = fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean);
  return lines
    .slice(-n)
    .reverse()
    .map((l) => JSON.parse(l));
}
