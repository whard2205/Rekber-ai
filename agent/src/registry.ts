// Terpisah dari store.ts (yang butuh config.ts, yang mewajibkan AI_ARBITER_PRIVATE_KEY di-set)
// supaya PhotoRegistry bisa dites tanpa env sama sekali — kelas ini murni fs + JSON, tidak
// punya alasan bergantung pada config chain/AI.
import fs from "node:fs";
import path from "node:path";

/** Registry hash foto unboxing pembeli lintas-deal, persist ke file. Hash yang sama di deal
 * LAIN = kemungkinan foto didaur ulang (pola sama dengan ProofRegistry MANDOR, tag mandor-final). */
export class PhotoRegistry {
  private map: Record<string, string> = {};

  constructor(private readonly file: string) {
    if (fs.existsSync(file)) this.map = JSON.parse(fs.readFileSync(file, "utf8"));
  }

  /** @returns true bila filename foto sudah pernah dipakai deal LAIN (duplikat). */
  checkAndRecord(photoFilename: string, dealCode: string): boolean {
    const seen = this.map[photoFilename];
    if (seen !== undefined && seen !== dealCode) return true;
    this.map[photoFilename] = seen ?? dealCode;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.map, null, 2));
    return false;
  }
}
