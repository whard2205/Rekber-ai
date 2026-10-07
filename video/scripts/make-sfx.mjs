// Bikin efek suara sendiri (WAV 16-bit mono), tanpa unduhan: pad ambient + whoosh transisi.
// Jalankan: node scripts/make-sfx.mjs
import fs from "node:fs";

const RATE = 22050;
function writeWav(path, samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.max(-1, Math.min(1, s)) * 32767, i * 2));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path, Buffer.concat([h, data]));
}

// Pad: akord A mayor lembut (A2 E3 A3 C#4), tiap nada dua sinus sedikit detune, napas pelan.
const padSeconds = 240;
const notes = [110, 164.81, 220, 277.18];
const pad = new Float32Array(padSeconds * RATE);
for (let i = 0; i < pad.length; i++) {
  const t = i / RATE;
  let v = 0;
  notes.forEach((f, k) => {
    v += Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 1.004 * t + k);
  });
  const breathe = 0.75 + 0.25 * Math.sin((2 * Math.PI * t) / 9);
  const fade = Math.min(1, t / 3, (padSeconds - t) / 3);
  pad[i] = (v / (notes.length * 2)) * 0.5 * breathe * fade;
}
writeWav("public/sfx/pad.wav", pad);

// Whoosh: noise dengan low-pass yang menyapu naik lalu turun, 0,5 detik.
const wLen = Math.round(0.5 * RATE);
const whoosh = new Float32Array(wLen);
let y = 0;
for (let i = 0; i < wLen; i++) {
  const p = i / wLen;
  const env = Math.sin(Math.PI * p) ** 2;
  const cutoff = 0.02 + 0.25 * Math.sin(Math.PI * p);
  y += cutoff * ((Math.random() * 2 - 1) - y);
  whoosh[i] = y * env * 1.6;
}
writeWav("public/sfx/whoosh.wav", whoosh);
console.log("sfx ok");
