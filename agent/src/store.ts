// Baca/tulis data yang dibagi dengan web/ — satu penulis per jenis data (docs/rekber-ai/PLAN.md §1):
// web menulis deal & bukti, agent HANYA menulis verdict, audit log, dan registry foto.
// Backend: Upstash Redis kalau env KV ada (deploy Vercel), selain itu file di data/.
// Sengaja tidak mengimpor config.ts supaya scripts/human-resolve.ts bisa memakainya tanpa
// AI_ARBITER_PRIVATE_KEY.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { kv, kvEnabled, kvKey } from "./kv.js";
import { PhotoRegistry } from "./registry.js";
import type { DealRecord, ImageInput } from "./types.js";

export { PhotoRegistry };

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = () => path.resolve(here, "..", process.env.DATA_DIR || "../data");

const EXT_MEDIA: Record<string, ImageInput["mediaType"]> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const dealsDir = () => path.join(dataDir(), "deals");
const evidenceDir = () => path.join(dataDir(), "evidence");
const verdictsDir = () => path.join(dataDir(), "verdicts");

export async function listDeals(): Promise<DealRecord[]> {
  if (kvEnabled()) return (await kv<string[]>("HVALS", kvKey("deals"))).map((v) => JSON.parse(v) as DealRecord);
  if (!fs.existsSync(dealsDir())) return [];
  return fs
    .readdirSync(dealsDir())
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dealsDir(), f), "utf8")) as DealRecord);
}

export async function readDeal(dealCode: string): Promise<DealRecord | null> {
  if (kvEnabled()) {
    const v = await kv<string | null>("HGET", kvKey("deals"), dealCode);
    return v ? (JSON.parse(v) as DealRecord) : null;
  }
  const p = path.join(dealsDir(), `${dealCode}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as DealRecord;
}

/** Baca satu foto bukti sebagai ImageInput berlabel, siap dikirim ke model vision.
 * filename = nama bukti (mis. "<keccak256 tanpa 0x>.jpg"). */
export async function loadEvidenceImage(filename: string, label: string): Promise<ImageInput | null> {
  const mediaType = EXT_MEDIA[path.extname(filename).toLowerCase()];
  if (!mediaType) return null;
  if (kvEnabled()) {
    const base64 = await kv<string | null>("GET", kvKey(`ev:${filename}`));
    return base64 ? { label, base64, mediaType } : null;
  }
  const p = path.join(evidenceDir(), filename);
  if (!fs.existsSync(p)) return null;
  return { label, base64: fs.readFileSync(p).toString("base64"), mediaType };
}

export async function writeVerdict(dealCode: string, verdict: unknown): Promise<void> {
  if (kvEnabled()) {
    await kv("HSET", kvKey("verdicts"), dealCode, JSON.stringify(verdict));
    return;
  }
  fs.mkdirSync(verdictsDir(), { recursive: true });
  fs.writeFileSync(path.join(verdictsDir(), `${dealCode}.json`), JSON.stringify(verdict, null, 2));
}

export async function readVerdict(dealCode: string): Promise<unknown | null> {
  if (kvEnabled()) {
    const v = await kv<string | null>("HGET", kvKey("verdicts"), dealCode);
    return v ? JSON.parse(v) : null;
  }
  const p = path.join(verdictsDir(), `${dealCode}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export async function appendAuditLog(entry: Record<string, unknown>): Promise<void> {
  if (kvEnabled()) {
    await kv("RPUSH", kvKey("audit"), JSON.stringify(entry));
    return;
  }
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.appendFileSync(path.join(dataDir(), "audit-log.jsonl"), JSON.stringify(entry) + "\n");
}

/** Registry foto yang sesuai backend: Redis kalau aktif, file di data/ kalau tidak. */
export function openPhotoRegistry(): PhotoRegistry {
  return new PhotoRegistry(kvEnabled() ? null : path.join(dataDir(), "photo-registry.json"));
}
