import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { keccak256, toHex, type Hex } from "viem";
import { config } from "./config";

// Tipe deal — field & urutan key PERSIS sama dengan docs/rekber-ai/PLAN.md §3.3 (hash
// dihitung dari JSON.stringify, urutan key menentukan hash). Duplikat dari agent/src/types.ts
// dengan sengaja (agent & web paket terpisah, tanpa lib bersama — pola sama dengan chain.ts).

export interface Spec {
  dealCode: string;
  seller: string;
  title: string;
  /** Rupiah utuh sebagai string (token 0 desimal): "8500000" = Rp8.500.000. */
  priceIDRX: string;
  description: string;
  checklist: string[];
  listingPhotos: string[];
}

export interface ShipmentEvidence {
  packingPhotos: string[];
  resiPhoto: string | null;
  resiText: string;
  shipmentHash: string;
  submittedAt: string;
}

export interface DisputeEvidence {
  photos: string[];
  complaint: string;
  disputeHash: string;
  submittedAt: string;
}

export interface SellerResponseEvidence {
  photos: string[];
  text: string;
  responseHash: string;
  respondedAt: string;
}

export interface DealRecord {
  dealCode: string;
  dealId: string;
  createdAt: string;
  seller: string;
  spec: Spec;
  specHash: string;
  offer: { deadline: number; sig: string };
  shipment?: ShipmentEvidence;
  dispute?: DisputeEvidence;
  sellerResponse?: SellerResponseEvidence;
  txs: { fund?: string; ship?: string; confirm?: string; dispute?: string };
}

// Tanpa karakter ambigu (0/O, 1/I/L) — pola sama dengan generateChallenge agent MANDOR
// (tag mandor-final, agent/src/loop.ts).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateDealCode(): string {
  const bytes = crypto.randomBytes(6);
  let code = "";
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `RKB-${code}`;
}

/** dealId diturunkan deterministik dari dealCode (bukan acak) — siapa pun yang tahu link
 * transaksi bisa menghitung dealId yang sama sendiri, tanpa perlu lookup tambahan. Ini
 * tidak melemahkan keamanan: dealCode toh sudah publik di link, dan yang benar-benar
 * mencegah penyerobotan adalah tanda tangan Offer penjual (§3.2), bukan kerahasiaan dealId. */
export function dealIdFor(dealCode: string): Hex {
  return keccak256(toHex(dealCode));
}

export function computeSpecHash(spec: Spec): Hex {
  return keccak256(toHex(JSON.stringify(spec)));
}

export function computeShipmentHash(input: { packingPhotos: string[]; resiPhoto: string | null; resiText: string }): Hex {
  return keccak256(toHex(JSON.stringify(input)));
}

export function computeDisputeHash(input: { photos: string[]; complaint: string }): Hex {
  return keccak256(toHex(JSON.stringify(input)));
}

export function computeResponseHash(input: { photos: string[]; text: string }): Hex {
  return keccak256(toHex(JSON.stringify(input)));
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
