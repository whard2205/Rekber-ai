import { NextResponse } from "next/server";
import { mint, translateChainError } from "@/lib/chain";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const FAUCET_AMOUNT = 10_000_000n; // Rp10 juta (token 0 desimal)
const COOLDOWN_MS = 10 * 60 * 1000;

// ponytail: Map di memori, hilang saat server restart/scale-out — cukup untuk demo
// hackathon satu-instance; upgrade ke rate-limit persisten (mis. KV) kalau perlu produksi.
const lastClaim = new Map<string, number>();

export async function POST(req: Request) {
  if (!config.faucetEnabled) {
    return NextResponse.json({ error: "Faucet dimatikan" }, { status: 403 });
  }
  if (config.chainId === 56) {
    return NextResponse.json({ error: "Faucet tidak tersedia di mainnet" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const address = body?.address;
  if (typeof address !== "string" || !ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "address tidak valid" }, { status: 400 });
  }

  const key = address.toLowerCase();
  const last = lastClaim.get(key);
  if (last && Date.now() - last < COOLDOWN_MS) {
    const waitSec = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 1000);
    return NextResponse.json({ error: `Sudah klaim saldo demo — tunggu ${waitSec} detik lagi` }, { status: 429 });
  }

  try {
    const receipt = await mint(address as `0x${string}`, FAUCET_AMOUNT);
    lastClaim.set(key, Date.now());
    return NextResponse.json({ txHash: receipt.transactionHash, amount: FAUCET_AMOUNT.toString() });
  } catch (err) {
    return NextResponse.json({ error: translateChainError(err) }, { status: 400 });
  }
}
