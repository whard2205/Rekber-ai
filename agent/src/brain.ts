import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import type { HumanTaskSpec, ProofImage, Verdict } from "./types.js";

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

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    decision: { type: "string", enum: ["pass", "fail"] },
    reasoning: { type: "string" },
  },
  required: ["decision", "reasoning"],
  additionalProperties: false,
} as const;

function firstText(response: Anthropic.Message): string {
  if (response.stop_reason === "refusal") throw new Error("Model menolak permintaan (refusal)");
  if (response.stop_reason === "max_tokens") throw new Error("Output terpotong (max_tokens)");
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Tidak ada text block di respons");
  return block.text;
}

/** Pecah goal user menjadi task-task yang butuh manusia di dunia fisik. */
export async function planTasks(goal: string): Promise<HumanTaskSpec[]> {
  if (config.mockBrain) {
    console.log("[brain] MODE MOCK — planTasks mengembalikan task dummy, bukan hasil AI");
    return [
      {
        title: "[MOCK] Foto jempol 1",
        instructions: "Ambil satu foto jempol tangan (mock).",
        acceptanceCriteria: ["Terlihat jempol manusia"],
        bountyIDRX: 500000,
      },
      {
        title: "[MOCK] Foto jempol 2",
        instructions: "Ambil satu foto jempol tangan (mock).",
        acceptanceCriteria: ["Terlihat jempol manusia"],
        bountyIDRX: 500000,
      },
    ];
  }

  const response = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 4096, // output sengaja pendek: daftar task JSON
    thinking: { type: "adaptive" },
    system: [
      "Kamu adalah MANDOR, AI agent yang mempekerjakan manusia untuk tugas dunia fisik yang tidak bisa dilakukan AI.",
      "Pecah goal user menjadi task foto/verifikasi sederhana yang bisa dikerjakan satu orang dengan HP dalam <10 menit.",
      "Satu task = satu bukti foto. Kalau goal butuh N bukti, buat N task identik.",
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
  }));
}

/** Verifikasi bukti foto worker terhadap kriteria task. Ragu = fail (task dibuka lagi, dana tetap aman). */
export async function verifyProof(spec: HumanTaskSpec, proof: ProofImage): Promise<Verdict> {
  if (config.mockBrain) {
    console.log("[brain] MODE MOCK — verifyProof selalu pass, bukan hasil AI");
    return { decision: "pass", reasoning: "[MOCK] verifikasi dilewati" };
  }

  const response = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 1024, // output sengaja pendek: verdict JSON
    thinking: { type: "adaptive" },
    system: [
      "Kamu adalah verifikator MANDOR. Periksa apakah foto bukti kerja memenuhi SEMUA kriteria task.",
      "Tegas tapi adil: foto asli yang jelas memenuhi kriteria = pass. Foto tidak relevan, screenshot, hasil kamera yang tidak sesuai kriteria, atau meragukan = fail.",
      "Kalau ragu, pilih fail — task akan dibuka lagi untuk worker lain, dana tetap aman di escrow.",
      "Tulis reasoning singkat dalam bahasa Indonesia (ditampilkan ke worker dan penonton demo).",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: proof.mediaType, data: proof.base64 },
          },
          {
            type: "text",
            text: [
              `Task: ${spec.title}`,
              `Instruksi: ${spec.instructions}`,
              `Kriteria penerimaan:`,
              ...spec.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`),
            ].join("\n"),
          },
        ],
      },
    ],
    output_config: { format: { type: "json_schema", schema: VERDICT_SCHEMA } },
  });

  return JSON.parse(firstText(response)) as Verdict;
}
