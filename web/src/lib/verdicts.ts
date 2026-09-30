import "server-only";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { kv, kvEnabled, kvKey } from "./kv";

// Baca SAJA — verdict & audit log ditulis oleh agent (docs/rekber-ai/PLAN.md §1 "satu
// penulis per file"). web hanya menampilkannya, tidak pernah menulis ke sini.
export async function readVerdict(dealCode: string): Promise<unknown | null> {
  if (kvEnabled) {
    const v = await kv<string | null>("HGET", kvKey("verdicts"), dealCode);
    return v ? JSON.parse(v) : null;
  }
  const p = path.join(config.dataDir, "verdicts", `${dealCode}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/** n entri terakhir audit log agent, terbaru dulu. */
export async function readAuditLogTail(n: number): Promise<unknown[]> {
  let lines: string[];
  if (kvEnabled) {
    lines = await kv<string[]>("LRANGE", kvKey("audit"), -n, -1);
  } else {
    const p = path.join(config.dataDir, "audit-log.jsonl");
    if (!fs.existsSync(p)) return [];
    lines = fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean).slice(-n);
  }
  return lines.reverse().map((l) => JSON.parse(l));
}
