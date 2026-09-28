import "server-only";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

// Baca SAJA — verdicts/ ditulis oleh agent (docs/rekber-ai/PLAN.md §1 "satu penulis per
// file"). web hanya menampilkannya, tidak pernah menulis ke sini.
export function readVerdict(dealCode: string): unknown | null {
  const p = path.join(config.dataDir, "verdicts", `${dealCode}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
