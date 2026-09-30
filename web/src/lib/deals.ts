import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { kv, kvEnabled, kvKey } from "./kv";

// Tipe + fungsi hash (computeSpecHash dkk, dealIdFor) dipindah ke spec.ts — modul MURNI
// tanpa "server-only" supaya bisa diimpor dari client component (app/jual/page.tsx butuh
// menghitung specHash yang SAMA sebelum menandatangani Offer). Re-export di sini untuk
// kenyamanan pemanggil sisi server yang butuh keduanya sekaligus (fs + hash) dari satu impor.
export * from "./spec";
import type { DealRecord } from "./spec";

// Tanpa karakter ambigu (0/O, 1/I/L) — pola sama dengan generateChallenge agent MANDOR
// (tag mandor-final, agent/src/loop.ts).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateDealCode(): string {
  const bytes = crypto.randomBytes(6);
  let code = "";
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `RKB-${code}`;
}

const dealsDir = () => path.join(config.dataDir, "deals");
const DEALS = kvKey("deals"); // hash: dealCode → JSON DealRecord

export async function dealExists(dealCode: string): Promise<boolean> {
  if (kvEnabled) return (await kv<number>("HEXISTS", DEALS, dealCode)) === 1;
  return fs.existsSync(path.join(dealsDir(), `${dealCode}.json`));
}

export async function readDeal(dealCode: string): Promise<DealRecord | null> {
  if (kvEnabled) {
    const v = await kv<string | null>("HGET", DEALS, dealCode);
    return v ? (JSON.parse(v) as DealRecord) : null;
  }
  const p = path.join(dealsDir(), `${dealCode}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as DealRecord;
}

export async function writeDeal(deal: DealRecord): Promise<void> {
  if (kvEnabled) {
    await kv("HSET", DEALS, deal.dealCode, JSON.stringify(deal));
    return;
  }
  fs.mkdirSync(dealsDir(), { recursive: true });
  fs.writeFileSync(path.join(dealsDir(), `${deal.dealCode}.json`), JSON.stringify(deal, null, 2));
}

export async function listDeals(): Promise<DealRecord[]> {
  let deals: DealRecord[];
  if (kvEnabled) {
    deals = (await kv<string[]>("HVALS", DEALS)).map((v) => JSON.parse(v) as DealRecord);
  } else {
    if (!fs.existsSync(dealsDir())) return [];
    deals = fs
      .readdirSync(dealsDir())
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(dealsDir(), f), "utf8")) as DealRecord);
  }
  return deals.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
