import "server-only";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";

/** Nama file bukti = keccak256(isi file) tanpa prefix 0x + ekstensi asal MIME
 * (docs/rekber-ai/PLAN.md §3.3). Content-addressed: nama menentukan isi. */

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const EVIDENCE_NAME_RE = /^(keccak)?[0-9a-fA-F]{64}\.(jpg|png|webp)$/;

/** MIME yang diterima + ukuran maksimum (server-side jaring pengaman, lihat image.ts). */
export function validateEvidenceBlob(blob: Blob): string | null {
  if (!(blob.size > 0)) return "File bukti kosong";
  if (blob.size > config.maxUploadMb * 1024 * 1024) {
    return `File bukti terlalu besar — maksimum ${config.maxUploadMb}MB`;
  }
  const ext = EXT_BY_MIME[blob.type];
  if (!ext) return "Format file tidak didukung — gunakan JPG, PNG, atau WebP";
  return null;
}

export function extForMime(mime: string): string | null {
  return EXT_BY_MIME[mime] ?? null;
}

export function evidencePath(name: string): string {
  return path.join(config.dataDir, "evidence", name);
}

/** Cek bahwa nama file bukti valid (hash keccak + ekstensi yang dikenal) DAN filenya
 * benar-benar ada di data/evidence/. Dipakai server sebelum menulis/memverifikasi deal
 * supaya `spec.listingPhotos` tidak bisa menunjuk ke file yang tidak pernah diupload. */
export function evidenceExists(name: string): boolean {
  if (typeof name !== "string" || !EVIDENCE_NAME_RE.test(name)) return false;
  return fs.existsSync(evidencePath(name));
}

/** `0x`-prefixed keccak256 hex (64 hex chars) — dipakai client (match nama server) dan
 * server (hitung nama saat dedup). */
export const HASH_HEX_RE = /^0x[0-9a-fA-F]{64}$/;
