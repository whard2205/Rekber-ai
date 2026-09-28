import { NextResponse } from "next/server";
import { permitNonce } from "@/lib/chain";

export const dynamic = "force-dynamic";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const owner = searchParams.get("owner");
  if (!owner || !ADDRESS_RE.test(owner)) {
    return NextResponse.json({ error: "owner tidak valid" }, { status: 400 });
  }
  const nonce = await permitNonce(owner as `0x${string}`);
  return NextResponse.json({ nonce: nonce.toString() });
}
