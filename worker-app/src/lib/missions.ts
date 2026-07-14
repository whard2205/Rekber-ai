import "server-only";
import fs from "node:fs";
import path from "node:path";
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

export interface MissionState {
  goal: string;
  updatedAt: string;
  tasks: MissionTaskEntry[];
}

/** State misi lengkap (goal + tasks), atau null bila agent belum pernah jalan. */
export function readMission(): MissionState | null {
  if (!fs.existsSync(config.missionsFile)) return null;
  return JSON.parse(fs.readFileSync(config.missionsFile, "utf8")) as MissionState;
}

/** Spesifikasi + verdict task ditulis agent ke file lokal (lihat agent/src/loop.ts).
 * v0 pragmatis untuk demo satu-mesin; upgrade path: IPFS/Pinata per README. */
export function readMissionState(): Map<string, MissionTaskEntry> {
  const map = new Map<string, MissionTaskEntry>();
  const state = readMission();
  if (!state) return map;
  for (const t of state.tasks) map.set(t.taskId, t);
  return map;
}

export interface AuditEntry {
  ts: string;
  taskId: string;
  worker: string;
  txHash: string;
  verifier: string;
  decision: "APPROVE" | "REJECT";
  confidence: number;
  reasons: string[];
}

/** Jejak keputusan agent (JSONL, ditulis agent/src/loop.ts) — bahan activity feed panggung. */
export function readAuditLog(limit = 20): AuditEntry[] {
  const file = path.join(path.dirname(config.missionsFile), "audit-log.jsonl");
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
  return lines.slice(-limit).reverse().map((l) => JSON.parse(l) as AuditEntry);
}

export function readMissionSpecs(): Map<string, HumanTaskSpec> {
  const map = new Map<string, HumanTaskSpec>();
  for (const [id, entry] of readMissionState()) map.set(id, entry.spec);
  return map;
}
