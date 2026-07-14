import "server-only";
import fs from "node:fs";
import { config } from "./config";

export interface HumanTaskSpec {
  title: string;
  instructions: string;
  acceptanceCriteria: string[];
  bountyIDRX: number;
  // Kode tantangan anti-cheat — worker wajib menampilkannya di foto bukti.
  challenge?: string;
}

export interface TaskVerdict {
  decision: "APPROVE" | "REJECT";
  reasons: string[];
  confidence: number;
}

export interface MissionTaskEntry {
  taskId: string;
  spec: HumanTaskSpec;
  paid: boolean;
  payoutTxHash?: string | null;
  lastVerdict?: TaskVerdict | null;
}

interface MissionState {
  goal: string;
  updatedAt: string;
  tasks: MissionTaskEntry[];
}

/** Spesifikasi + verdict task ditulis agent ke file lokal (lihat agent/src/loop.ts).
 * v0 pragmatis untuk demo satu-mesin; upgrade path: IPFS/Pinata per README. */
export function readMissionState(): Map<string, MissionTaskEntry> {
  const map = new Map<string, MissionTaskEntry>();
  if (!fs.existsSync(config.missionsFile)) return map;
  const state = JSON.parse(fs.readFileSync(config.missionsFile, "utf8")) as MissionState;
  for (const t of state.tasks) map.set(t.taskId, t);
  return map;
}

export function readMissionSpecs(): Map<string, HumanTaskSpec> {
  const map = new Map<string, HumanTaskSpec>();
  for (const [id, entry] of readMissionState()) map.set(id, entry.spec);
  return map;
}
