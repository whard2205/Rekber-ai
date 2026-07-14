import { NextResponse } from "next/server";
import { getTask, Status } from "@/lib/chain";
import { readMissionSpecs } from "@/lib/missions";

export const dynamic = "force-dynamic";

// Daftar task Open — yang bisa diambil worker manapun.
export async function GET() {
  const specs = readMissionSpecs();
  const listings = [];
  for (const [taskIdStr, spec] of specs) {
    const taskId = BigInt(taskIdStr);
    const onchain = await getTask(taskId);
    if (onchain.status !== Status.Open) continue;
    listings.push({
      taskId: taskIdStr,
      spec,
      bounty: onchain.bounty.toString(),
      deadline: onchain.deadline,
    });
  }
  return NextResponse.json({ tasks: listings });
}
