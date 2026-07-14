import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import type { HumanTaskSpec } from "./types.js";

// Verifikasi bukti pindah ke verifier.ts (pipeline berlapis + abstraksi provider).
// File ini sekarang hanya berisi PLANNING: goal user -> daftar task manusia.

const client = new Anthropic();

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          instructions: {
            type: "string",
            description:
              "Instruksi untuk pekerja manusia, bahasa Indonesia santai-sopan, jelas untuk orang awam non-crypto",
          },
          acceptance_criteria: {
            type: "array",
            items: { type: "string" },
            description: "Kriteria objektif yang bisa diverifikasi dari satu foto",
          },
          bounty_idr: {
            type: "integer",
            description: "Upah dalam satuan terkecil IDRX (2 desimal). 500000 = Rp 5.000",
          },
        },
        required: ["title", "instructions", "acceptance_criteria", "bounty_idr"],
        additionalProperties: false,
      },
    },
  },
  required: ["tasks"],
  additionalProperties: false,
} as const;

function firstText(response: Anthropic.Message): string {
  if (response.stop_reason === "refusal") throw new Error("Model menolak permintaan (refusal)");
  if (response.stop_reason === "max_tokens") throw new Error("Output terpotong (max_tokens)");
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Tidak ada text block di respons");
  return block.text;
}

/** Pecah goal user menjadi task-task yang butuh manusia di dunia fisik.
 * Field challenge diisi placeholder — loop yang membuat kode tantangan
 * (anti-cheat tidak boleh bergantung pada output model). */
export async function planTasks(goal: string): Promise<HumanTaskSpec[]> {
  if (config.mockBrain) {
    console.log("[brain] MODE MOCK — planTasks mengembalikan task dummy, bukan hasil AI");
    return [1, 2].map((n) => ({
      title: `[MOCK] Foto jempol ${n}`,
      instructions: "Ambil satu foto jempol tangan dengan kode tantangan terlihat (mock).",
      acceptanceCriteria: ["Terlihat jempol manusia", "Kode tantangan terlihat di foto"],
      bountyIDRX: 500000,
      challenge: "",
    }));
  }

  const response = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 4096, // output sengaja pendek: daftar task JSON
    thinking: { type: "adaptive" },
    system: [
      "Kamu adalah MANDOR, AI agent yang mempekerjakan manusia untuk tugas dunia fisik yang tidak bisa dilakukan AI.",
      "Pecah goal user menjadi task foto/verifikasi sederhana yang bisa dikerjakan satu orang dengan HP dalam <10 menit.",
      "Satu task = satu bukti foto. Kalau goal butuh N bukti, buat N task identik.",
      "Setiap task akan diberi kode tantangan oleh sistem; sebutkan di instructions bahwa worker harus menuliskan kode itu di kertas/layar dan mengikutkannya di foto.",
      "Tulis instructions dalam bahasa Indonesia yang jelas untuk orang awam. Kriteria harus objektif dan bisa dicek dari fotonya saja.",
      "Upah wajar per task: Rp 3.000 - Rp 20.000 (bounty_idr 300000 - 2000000).",
    ].join("\n"),
    messages: [{ role: "user", content: `Goal: ${goal}` }],
    output_config: { format: { type: "json_schema", schema: PLAN_SCHEMA } },
  });

  const parsed = JSON.parse(firstText(response)) as {
    tasks: { title: string; instructions: string; acceptance_criteria: string[]; bounty_idr: number }[];
  };
  return parsed.tasks.map((t) => ({
    title: t.title,
    instructions: t.instructions,
    acceptanceCriteria: t.acceptance_criteria,
    bountyIDRX: t.bounty_idr,
    challenge: "",
  }));
}
