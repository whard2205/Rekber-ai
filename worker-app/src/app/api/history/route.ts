import { NextResponse } from "next/server";
import { getPayoutsFor } from "@/lib/chain";
import { readMissionSpecs } from "@/lib/missions";

export const dynamic = "force-dynamic";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const worker = searchParams.get("worker");
  if (!worker || !ADDRESS_RE.test(worker)) {
    return NextResponse.json({ error: "worker query param tidak valid" }, { status: 400 });
  }

  const specs = readMissionSpecs();
  const payouts = await getPayoutsFor(worker as `0x${string}`);
  const items = payouts.map((p) => ({
    taskId: p.taskId.toString(),
    title: specs.get(p.taskId.toString())?.title ?? `Task #${p.taskId}`,
    amount: p.amount.toString(),
    txHash: p.transactionHash,
  }));
  const total = payouts.reduce((sum, p) => sum + p.amount, 0n).toString();
  return NextResponse.json({ items, total });
}
