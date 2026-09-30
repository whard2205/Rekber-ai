import { NextResponse } from "next/server";
import { generateDealCode, dealIdFor, dealExists, writeDeal } from "@/lib/deals";
import { badBytes32 } from "@/lib/validation";
import type { Hex } from "viem";

export const dynamic = "force-dynamic";

/** POST /api/deals/new — alokasikan kode transaksi baru (docs/rekber-ai/PLAN.md §3.6).
 * Server memastikan kode belum dipakai (race-safe: tulis file deal stub langsung). */
export async function POST() {
  // Cek 100 kali kalau-kalau kebetulan nabrak kode yang sudah ada (probabiliti ~0).
  for (let i = 0; i < 100; i++) {
    const dealCode = generateDealCode();
    if (await dealExists(dealCode)) continue;
    const dealId = dealIdFor(dealCode);
    const err = badBytes32(dealId);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    await writeDeal({
      dealCode,
      dealId,
      createdAt: new Date().toISOString(),
      seller: "",
      spec: {
        dealCode,
        seller: "",
        title: "",
        priceIDRX: "0",
        description: "",
        checklist: [],
        listingPhotos: [],
      },
      specHash: `0x${"0".repeat(64)}` as Hex,
      offer: { deadline: 0, sig: "0x" },
      txs: {},
    });
    return NextResponse.json({ dealCode, dealId });
  }
  return NextResponse.json({ error: "Kode transaksi unik tidak ditemukan — coba lagi" }, { status: 500 });
}
