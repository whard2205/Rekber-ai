import "server-only";
import fs from "node:fs";
import { config } from "./config";
import type { OnchainTask } from "./chain";

export interface HumanTaskSpec {
  title: string;
  instructions: string;
  acceptanceCriteria: string[];
  bountyIDRX: number;
}

interface MissionState {
  goal: string;
  updatedAt: string;
  tasks: { taskId: string; spec: HumanTaskSpec; paid: boolean }[];
}

export interface TaskListing {
  taskId: bigint;
  spec: HumanTaskSpec;
  onchain: OnchainTask;
}

/** Spesifikasi task ditulis agent ke file lokal (lihat agent/src/loop.ts).
 * v0 pragmatis untuk demo satu-mesin; upgrade path: IPFS/Pinata per spec di BLUEPRINT.md. */
export function readMissionSpecs(): Map<string, HumanTaskSpec> {
  const map = new Map<string, HumanTaskSpec>();
  if (!fs.existsSync(config.missionsFile)) return map;
  const state = JSON.parse(fs.readFileSync(config.missionsFile, "utf8")) as MissionState;
  for (const t of state.tasks) map.set(t.taskId, t.spec);
  return map;
}
