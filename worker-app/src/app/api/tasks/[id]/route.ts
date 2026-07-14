import { NextResponse } from "next/server";
import { getTask, Status } from "@/lib/chain";
import { readMissionSpecs } from "@/lib/missions";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const specs = readMissionSpecs();
  const spec = specs.get(id);
  if (!spec) return NextResponse.json({ error: "Task tidak ditemukan" }, { status: 404 });

  const onchain = await getTask(BigInt(id));
  if (onchain.status === Status.None) {
    return NextResponse.json({ error: "Task tidak ditemukan on-chain" }, { status: 404 });
  }

  return NextResponse.json({
    taskId: id,
    spec,
    bounty: onchain.bounty.toString(),
    deadline: onchain.deadline,
    status: onchain.status,
    worker: onchain.worker,
  });
}
