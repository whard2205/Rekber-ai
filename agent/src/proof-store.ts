import fs from "node:fs";
import path from "node:path";
import type { Hex } from "viem";
import { config } from "./config.js";
import type { ProofImage } from "./types.js";

const EXTENSIONS: Record<string, ProofImage["mediaType"]> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/**
 * v0: worker-app menyimpan file bukti sebagai uploads/<proofHash tanpa 0x>.<ext>
 * (proofHash = sha256 file, dicek relayer sebelum submit on-chain).
 * Upgrade path: IPFS/Pinata dengan interface yang sama.
 */
export function getProof(proofHash: Hex): ProofImage | null {
  const name = proofHash.replace(/^0x/, "");
  for (const [ext, mediaType] of Object.entries(EXTENSIONS)) {
    const p = path.join(config.proofDir, name + ext);
    if (fs.existsSync(p)) {
      return { base64: fs.readFileSync(p).toString("base64"), mediaType };
    }
  }
  return null;
}
