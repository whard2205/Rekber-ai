import "server-only";
import { type Address, type Hex, isAddress } from "viem";
import { type Spec } from "./deals";

/** Validasi input sisi server untuk route API R-08 (docs/rekber-ai/PLAN.md §3.6).
 * Pesan Bahasa Indonesia, ditampilkan ke pengguna. */

export function badAddress(v: unknown): string | null {
  if (typeof v !== "string" || !isAddress(v)) return "Alamat wallet tidak valid";
  return null;
}

/** `spec` lengkap & tipenya benar sebelum hash dihitung. */
export function badSpec(v: unknown): string | null {
  if (typeof v !== "object" || v === null) return "Janji penjual (spec) tidak valid";
  const s = v as Record<string, unknown>;
  if (typeof s.dealCode !== "string" || !s.dealCode.startsWith("RKB-")) {
    return "Kode transaksi tidak valid";
  }
  if (typeof s.title !== "string" || s.title.trim().length < 3) {
    return "Nama barang minimal 3 karakter";
  }
  if (typeof s.description !== "string" || s.description.trim().length < 10) {
    return "Deskripsi minimal 10 karakter — pembeli butuh detail barang";
  }
  if (typeof s.priceIDRX !== "string" || !/^\d+$/.test(s.priceIDRX)) {
    return "Harga harus angka Rupiah utuh, mis. 8500000";
  }
  const price = BigInt(s.priceIDRX);
  const MAX_PRICE = 1_000_000_000n; // Rp1 miliar — plafon demo, bukan batas on-chain
  if (price <= 0n) return "Harga tidak boleh nol";
  if (price > MAX_PRICE) return "Harga demo maksimum Rp1 miliar";
  if (!Array.isArray(s.checklist) || s.checklist.length === 0) {
    return "Checklist janji penjual minimal 1 poin";
  }
  if (s.checklist.some((c) => typeof c !== "string" || !c.trim())) {
    return "Semua poin checklist harus teks yang tidak kosong";
  }
  if (!Array.isArray(s.listingPhotos) || s.listingPhotos.length === 0 || s.listingPhotos.length > 3) {
    return "Foto barang harus 1–3 foto";
  }
  if (s.listingPhotos.some((p) => typeof p !== "string")) {
    return "Daftar foto barang tidak valid";
  }
  return null;
}

/** Error string kalau spec tidak cocok dengan data yang diberikan / hash-nya. */
export function badSpecMatch(spec: Spec, dealCode: string, seller: Address): string | null {
  if (spec.dealCode !== dealCode) return "Kode transaksi pada spec tidak cocok";
  if (spec.seller.toLowerCase() !== seller.toLowerCase()) return "Penjual pada spec tidak cocok";
  return null;
}

export function badOfferPayload(v: unknown): string | null {
  if (typeof v !== "object" || v === null) return "Payload offer tidak valid";
  const o = v as Record<string, unknown>;
  if (typeof o.deadline !== "number" || !Number.isFinite(o.deadline) || o.deadline <= 0) {
    return "Batas waktu offer tidak valid";
  }
  if (typeof o.sig !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(o.sig)) {
    return "Format tanda tangan tidak valid";
  }
  return null;
}

/** Hex 32-byte (specHash/dealId). */
export function badBytes32(v: unknown): string | null {
  if (typeof v !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(v)) return "Hash tidak valid";
  return null;
}

export function asAddress(v: string): Address {
  return v as Address;
}
export function asHex(v: string): Hex {
  return v as Hex;
}
