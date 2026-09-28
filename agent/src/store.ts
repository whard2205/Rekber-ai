// Baca/tulis data/ (dibagi dengan web/) — satu penulis per file (docs/rekber-ai/PLAN.md §1):
// web menulis deals/ & evidence/, agent HANYA menulis verdicts/ & audit-log.jsonl &
// photo-registry.json. Agent tidak pernah menulis ke deals/ atau evidence/.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import type { DealRecord, ImageInput } from "./types.js";

export { PhotoRegistry } from "./registry.js";

const EXT_MEDIA: Record<string, ImageInput["mediaType"]> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const dealsDir = () => path.join(config.dataDir, "deals");
const evidenceDir = () => path.join(config.dataDir, "evidence");
const verdictsDir = () => path.join(config.dataDir, "verdicts");

export function listDeals(): DealRecord[] {
  if (!fs.existsSync(dealsDir())) return [];
  return fs
    .readdirSync(dealsDir())
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dealsDir(), f), "utf8")) as DealRecord);
}

export function readDeal(dealCode: string): DealRecord | null {
  const p = path.join(dealsDir(), `${dealCode}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as DealRecord;
}

/** Baca satu foto bukti sebagai ImageInput berlabel, siap dikirim ke model vision.
 * filename = nama file di data/evidence/ (mis. "<keccak256 tanpa 0x>.jpg"). */
export function loadEvidenceImage(filename: string, label: string): ImageInput | null {
  const mediaType = EXT_MEDIA[path.extname(filename).toLowerCase()];
  if (!mediaType) return null;
  const p = path.join(evidenceDir(), filename);
  if (!fs.existsSync(p)) return null;
  return { label, base64: fs.readFileSync(p).toString("base64"), mediaType };
}

export function writeVerdict(dealCode: string, verdict: unknown): void {
  fs.mkdirSync(verdictsDir(), { recursive: true });
  fs.writeFileSync(path.join(verdictsDir(), `${dealCode}.json`), JSON.stringify(verdict, null, 2));
}

export function readVerdict(dealCode: string): unknown | null {
  const p = path.join(verdictsDir(), `${dealCode}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function appendAuditLog(entry: Record<string, unknown>): void {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.appendFileSync(path.join(config.dataDir, "audit-log.jsonl"), JSON.stringify(entry) + "\n");
}
