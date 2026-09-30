import "server-only";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { kv, kvEnabled, kvKey } from "./kv";

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

function evidencePath(name: string): string {
  return path.join(config.dataDir, "evidence", name);
}

// Di Redis foto disimpan sebagai base64 per kunci. Foto sudah di-resize ≤2000px di browser
// (image.ts), jadi ratusan KB — muat di batas request Upstash.
// ponytail: foto di Redis; pindah ke object storage kalau volume foto jadi besar.
const evKey = (name: string) => kvKey(`ev:${name}`);

/** Simpan bukti. Nama = hash isi, jadi menulis ulang isi yang sama = no-op. */
export async function saveEvidence(name: string, bytes: Uint8Array): Promise<void> {
  if (kvEnabled) {
    await kv("SET", evKey(name), Buffer.from(bytes).toString("base64"), "NX");
    return;
  }
  fs.mkdirSync(path.dirname(evidencePath(name)), { recursive: true });
  fs.writeFileSync(evidencePath(name), bytes);
}

export async function readEvidence(name: string): Promise<Buffer | null> {
  if (kvEnabled) {
    const v = await kv<string | null>("GET", evKey(name));
    return v ? Buffer.from(v, "base64") : null;
  }
  return fs.existsSync(evidencePath(name)) ? fs.readFileSync(evidencePath(name)) : null;
}

/** Cek bahwa nama file bukti valid (hash keccak + ekstensi yang dikenal) DAN buktinya
 * benar-benar tersimpan. Dipakai server sebelum menulis/memverifikasi deal supaya
 * `spec.listingPhotos` tidak bisa menunjuk ke file yang tidak pernah diupload. */
export async function evidenceExists(name: string): Promise<boolean> {
  if (typeof name !== "string" || !EVIDENCE_NAME_RE.test(name)) return false;
  if (kvEnabled) return (await kv<number>("EXISTS", evKey(name))) === 1;
  return fs.existsSync(evidencePath(name));
}

/** Nama-nama di `names` yang TIDAK tersimpan (kosong = semua ada). */
export async function missingEvidence(names: string[]): Promise<string[]> {
  const exists = await Promise.all(names.map(evidenceExists));
  return names.filter((_, i) => !exists[i]);
}

/** `0x`-prefixed keccak256 hex (64 hex chars) — dipakai client (match nama server) dan
 * server (hitung nama saat dedup). */
export const HASH_HEX_RE = /^0x[0-9a-fA-F]{64}$/;
