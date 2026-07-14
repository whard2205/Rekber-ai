/** Verifikasi cepat: proof-store.ts agent bisa menemukan file yang ditulis worker-app. */
import { config } from "../src/config.js";
import { getProof } from "../src/proof-store.js";

const hash = process.argv[2];
if (!hash) {
  console.error("Pakai: tsx scripts/verify-proof-store.ts 0x<proofHash>");
  process.exit(1);
}

console.log(`proofDir agent   : ${config.proofDir}`);
const proof = getProof(hash as `0x${string}`);
if (!proof) {
  console.error(`❌ File bukti TIDAK ditemukan untuk hash ${hash}`);
  process.exit(1);
}
console.log(`✅ File bukti ditemukan (mediaType=${proof.mediaType}, ${proof.base64.length} char base64)`);
