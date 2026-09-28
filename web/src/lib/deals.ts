import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

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

export function dealExists(dealCode: string): boolean {
  return fs.existsSync(path.join(dealsDir(), `${dealCode}.json`));
}

export function readDeal(dealCode: string): DealRecord | null {
  const p = path.join(dealsDir(), `${dealCode}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as DealRecord;
}

export function writeDeal(deal: DealRecord): void {
  fs.mkdirSync(dealsDir(), { recursive: true });
  fs.writeFileSync(path.join(dealsDir(), `${deal.dealCode}.json`), JSON.stringify(deal, null, 2));
}

export function listDeals(): DealRecord[] {
  if (!fs.existsSync(dealsDir())) return [];
  return fs
    .readdirSync(dealsDir())
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dealsDir(), f), "utf8")) as DealRecord)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
