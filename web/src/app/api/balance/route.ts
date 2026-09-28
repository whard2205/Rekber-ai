import { NextResponse } from "next/server";
import { balanceOf } from "@/lib/chain";

export const dynamic = "force-dynamic";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/** GET /api/balance?owner= — saldo MockIDRX pemilik. Dipakai `/d/[code]` untuk menentukan
 * apakah pembeli perlu klaim faucet sebelum bisa membayar (route ini tidak eksplisit ada
 * di tabel PLAN.md §3.6, tapi `balanceOf` sendiri sudah disebut sebagai target R-07). */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const owner = searchParams.get("owner");
  if (!owner || !ADDRESS_RE.test(owner)) {
    return NextResponse.json({ error: "owner tidak valid" }, { status: 400 });
  }
  const balance = await balanceOf(owner as `0x${string}`);
  return NextResponse.json({ balance: balance.toString() });
}
