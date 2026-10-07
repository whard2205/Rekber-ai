// Transkrip narasi dengan whisper.cpp (offline) -> out/voice-words.json (kata + cap waktu).
// Jalankan: node scripts/transcribe.mjs
import path from "node:path";
import fs from "node:fs";
import { installWhisperCpp, downloadWhisperModel, transcribe, toCaptions } from "@remotion/install-whisper-cpp";

const dir = path.resolve("whisper.cpp");
await installWhisperCpp({ to: dir, version: "1.5.5" });
await downloadWhisperModel({ model: "small", folder: dir });
const out = await transcribe({
  inputPath: path.resolve("out/voice16k.wav"),
  whisperPath: dir,
  model: "small",
  language: "id",
  tokenLevelTimestamps: true,
  whisperCppVersion: "1.5.5",
});
const { captions } = toCaptions({ whisperCppOutput: out });
fs.writeFileSync("out/voice-words.json", JSON.stringify(captions, null, 1));
console.log("words:", captions.length);
