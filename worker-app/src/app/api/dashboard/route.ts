import { NextResponse } from "next/server";
import os from "node:os";
import QRCode from "qrcode";
import { getTask } from "@/lib/chain";
import { readMission, readAuditLog } from "@/lib/missions";

export const dynamic = "force-dynamic";

/** URL worker-app yang bisa diakses HP penonton (LAN). Override: NEXT_PUBLIC_WORKER_URL. */
function workerUrl(): string {
  if (process.env.NEXT_PUBLIC_WORKER_URL) return process.env.NEXT_PUBLIC_WORKER_URL;
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === "IPv4" && !iface.internal) return `http://${iface.address}:3001`;
    }
  }
  return "http://localhost:3001";
}

export async function GET() {
  const mission = readMission();
  const url = workerUrl();
  const qr = await QRCode.toDataURL(url, { width: 480, margin: 1 });

  const tasks = [];
  if (mission) {
    for (const t of mission.tasks) {
      const onchain = await getTask(BigInt(t.taskId));
      tasks.push({
        taskId: t.taskId,
        title: t.spec.title,
        bounty: onchain.bounty.toString(),
        status: onchain.status,
        challenge: t.spec.challenge ?? null,
        worker: onchain.worker,
        lastVerdict: t.lastVerdict ?? null,
        payoutTxHash: t.payoutTxHash ?? null,
      });
    }
  }

  return NextResponse.json({
    goal: mission?.goal ?? null,
    updatedAt: mission?.updatedAt ?? null,
    tasks,
    audit: readAuditLog(12),
    url,
    qr,
  });
}
