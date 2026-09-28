import { NextResponse } from "next/server";
import { claimFor, getTask, Status, translateChainError } from "@/lib/chain";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const taskId = BigInt(id);
  const body = await req.json().catch(() => null);
  const worker = body?.workerAddress;

  if (typeof worker !== "string" || !ADDRESS_RE.test(worker)) {
    return NextResponse.json({ error: "workerAddress tidak valid" }, { status: 400 });
  }

  const onchain = await getTask(taskId);
  if (onchain.status !== Status.Open) {
    return NextResponse.json({ error: "Task ini sudah diambil orang lain atau tidak tersedia lagi" }, { status: 409 });
  }

  try {
    const receipt = await claimFor(taskId, worker as `0x${string}`);
    return NextResponse.json({ txHash: receipt.transactionHash });
  } catch (err) {
    return NextResponse.json({ error: translateChainError(err) }, { status: 400 });
  }
}
