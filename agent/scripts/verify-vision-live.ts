/**
 * Uji verifikasi vision NYATA (bukan mock) — generate gambar sungguhan berisi
 * kode tantangan, kirim ke provider aktif (config.verifierProvider), cetak
 * verdict mentah model. Membuktikan pipeline network+auth+vision+schema jalan
 * end-to-end dengan vendor sungguhan, terlepas dari plumbing HTTP yang sudah
 * dibuktikan lewat mock di smoke-test.mjs.
 */
import { Jimp, loadFont } from "jimp";
import { SANS_32_BLACK } from "jimp/fonts";
import { config } from "../src/config.js";
import { createModelVerifier, parseModelVerdict } from "../src/verifier.js";
import type { HumanTaskSpec } from "../src/types.js";

async function makeImage(lines: string[]): Promise<string> {
  const img = new Jimp({ width: 640, height: 360, color: 0xffffffff });
  const font = await loadFont(SANS_32_BLACK);
  lines.forEach((line, i) => img.print({ font, x: 24, y: 24 + i * 44, text: line }));
  const buf = await img.getBuffer("image/png");
  return buf.toString("base64");
}

async function run(label: string, spec: HumanTaskSpec, imageLines: string[]) {
  const base64 = await makeImage(imageLines);
  const verifier = createModelVerifier(config);
  console.log(`\n=== ${label} (provider: ${verifier.name}) ===`);
  console.log(`Gambar berisi: ${JSON.stringify(imageLines)}`);
  const raw = await verifier.evaluate(spec, { base64, mediaType: "image/png" });
  console.log("Raw model output:", JSON.stringify(raw, null, 2));
  const verdict = parseModelVerdict(raw); // buktikan output lolos schema validation kita
  console.log(`✅ Lolos schema validation. decision=${verdict.decision} confidence=${verdict.confidence}`);
}

async function main() {
  const spec: HumanTaskSpec = {
    title: "Foto papan tulisan kode",
    instructions: "Foto selembar kertas/papan yang menuliskan kode tantangan dengan jelas.",
    acceptanceCriteria: ["Kode tantangan tertulis dan terbaca jelas di foto"],
    bountyIDRX: 500000,
    challenge: "MDR-LIVE01",
  };

  await run("Skenario A: kode benar tertulis di gambar", spec, ["KODE TANTANGAN:", spec.challenge]);
  await run("Skenario B: kode SALAH / tidak ada di gambar", spec, ["Selamat pagi", "dari MANDOR"]);

  console.log("\n🎉 UJI VISION NYATA SELESAI — provider sungguhan merespons & lolos schema validation.");
}

main().catch((err) => {
  console.error("\n❌ Uji vision nyata gagal:", err);
  process.exit(1);
});
