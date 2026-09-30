// Terpisah dari store.ts supaya PhotoRegistry bisa dites tanpa env apa pun — dengan file,
// kelas ini murni fs + JSON.
import fs from "node:fs";
import path from "node:path";
import { kv, kvKey } from "./kv.js";

/** Registry hash foto unboxing pembeli lintas-deal. Hash yang sama di deal LAIN = kemungkinan
 * foto didaur ulang (pola sama dengan ProofRegistry MANDOR, tag mandor-final).
 * file = path JSON lokal; null = simpan di Redis (deploy Vercel, dibagi antar proses). */
export class PhotoRegistry {
  private map: Record<string, string> = {};

  constructor(private readonly file: string | null) {
    if (file && fs.existsSync(file)) this.map = JSON.parse(fs.readFileSync(file, "utf8"));
  }

  /** @returns true bila filename foto sudah pernah dipakai deal LAIN (duplikat). */
  async checkAndRecord(photoFilename: string, dealCode: string): Promise<boolean> {
    if (!this.file) {
      const key = kvKey("photos");
      await kv("HSETNX", key, photoFilename, dealCode);
      return (await kv<string>("HGET", key, photoFilename)) !== dealCode;
    }
    const seen = this.map[photoFilename];
    if (seen !== undefined && seen !== dealCode) return true;
    this.map[photoFilename] = seen ?? dealCode;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.map, null, 2));
    return false;
  }
}
