// Tipe + fungsi hash MURNI (viem saja, tanpa fs/node:crypto) — sengaja TANPA "server-only"
// supaya bisa diimpor langsung dari client component (mis. app/jual/page.tsx menandatangani
// Offer, yang butuh computeSpecHash + dealIdFor persis sama dengan yang dihitung ulang
// server). deals.ts (server-only, fs-based) re-export semua dari sini untuk kenyamanan
// pemanggil sisi server yang butuh keduanya sekaligus.
//
// Field & urutan key PERSIS sama dengan docs/rekber-ai/PLAN.md §3.3 (hash dihitung dari
// JSON.stringify, urutan key menentukan hash). Duplikat dari agent/src/types.ts dengan
// sengaja (agent & web paket terpisah, tanpa lib bersama — pola sama dengan chain.ts).
import { keccak256, toHex, type Hex } from "viem";

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
