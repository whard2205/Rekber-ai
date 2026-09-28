import { NextResponse } from "next/server";
import { getTask } from "@/lib/chain";
import { readAuditLogFor, readMissionSpecs } from "@/lib/missions";

export const dynamic = "force-dynamic";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const worker = searchParams.get("worker");
  if (!worker || !ADDRESS_RE.test(worker)) {
    return NextResponse.json({ error: "worker query param tidak valid" }, { status: 400 });
  }

  // O-07: riwayat dibangun dari audit-log.jsonl (bukan eth_getLogs dari block 0,
  // yang gagal di testnet begitu range-nya besar). Setiap APPROVE di audit log
  // sudah memuat taskId + txHash; bounty diambil dari on-chain getTask.
  const specs = readMissionSpecs();
  const approvals = readAuditLogFor(worker);

  let total = 0n;
  const items = [];
  for (const entry of approvals) {
    const onchain = await getTask(BigInt(entry.taskId)).catch(() => null);
    if (!onchain) continue; // task tidak ditemukan on-chain (mis. chain di-reset) — lewati
    total += onchain.bounty;
    items.push({
      taskId: entry.taskId,
      title: specs.get(entry.taskId)?.title ?? `Task #${entry.taskId}`,
      amount: onchain.bounty.toString(),
      txHash: entry.txHash,
    });
  }

  return NextResponse.json({ items, total: total.toString() });
}
