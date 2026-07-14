/**
 * Pipeline verifikasi bukti berlapis (Phase 4 anti-cheat):
 *  1. cek deterministik: file ada, ukuran, deadline, duplikat lintas-task
 *  2. evaluasi model multimodal (di balik abstraksi ModelVerifier)
 *  3. validasi schema output model SEBELUM aksi finansial apa pun
 *  4. gating fail-safe: APPROVE hanya jika semua syarat + ambang confidence lolos
 *
 * Catatan trust assumption: verifier ini adalah oracle off-chain yang dipegang
 * agent — BUKAN "trustless AI". Perlindungan worker justru datang dari kontrak
 * (forceRelease bila agent diam melewati verifyWindow).
 */
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type { Hex } from "viem";
import type { HumanTaskSpec, ProofImage } from "./types.js";

// Batas ukuran bukti: 8 MB biner ≈ 10,7 juta karakter base64.
const MAX_PROOF_BASE64_CHARS = Math.ceil((8 * 1024 * 1024 * 4) / 3);

export interface ModelVerdict {
  challengeMatched: boolean;
  requirementsMatched: boolean;
  confidence: number; // 0..1
  decision: "APPROVE" | "REJECT";
  reasons: string[];
}

export interface VerifierVerdict extends ModelVerdict {
  taskId: string;
  duplicateDetected: boolean;
  evidenceHash: Hex;
}

/** Abstraksi provider — sistem tidak bergantung pada satu vendor model.
 * Implementasi: AnthropicModelVerifier (produksi), MockModelVerifier (uji offline). */
export interface ModelVerifier {
  name: string;
  evaluate(spec: HumanTaskSpec, proof: ProofImage): Promise<unknown>;
}

/** Validasi schema output model. Melempar Error dengan pesan jelas bila tidak valid —
 * TIDAK PERNAH langsung dipercaya untuk aksi finansial. */
export function parseModelVerdict(raw: unknown): ModelVerdict {
  if (typeof raw !== "object" || raw === null) throw new Error("Verdict model bukan objek");
  const v = raw as Record<string, unknown>;
  if (typeof v.challengeMatched !== "boolean") throw new Error("challengeMatched harus boolean");
  if (typeof v.requirementsMatched !== "boolean") throw new Error("requirementsMatched harus boolean");
  if (typeof v.confidence !== "number" || v.confidence < 0 || v.confidence > 1) {
    throw new Error("confidence harus angka 0..1");
  }
  if (v.decision !== "APPROVE" && v.decision !== "REJECT") {
    throw new Error("decision harus APPROVE atau REJECT");
  }
  if (!Array.isArray(v.reasons) || v.reasons.some((r) => typeof r !== "string")) {
    throw new Error("reasons harus array string");
  }
  return {
    challengeMatched: v.challengeMatched,
    requirementsMatched: v.requirementsMatched,
    confidence: v.confidence,
    decision: v.decision,
    reasons: v.reasons as string[],
  };
}

/** Registry hash bukti lintas-task, persist ke file. Hash yang sama untuk task
 * berbeda = duplikat (foto didaur ulang). Task yang sama boleh (resubmission). */
export class ProofRegistry {
  private map: Record<string, string> = {};

  constructor(private readonly file: string) {
    if (fs.existsSync(file)) {
      this.map = JSON.parse(fs.readFileSync(file, "utf8"));
    }
  }

  /** @returns true bila hash sudah pernah dipakai task LAIN (duplikat). */
  checkAndRecord(proofHash: Hex, taskId: string): boolean {
    const seen = this.map[proofHash];
    if (seen !== undefined && seen !== taskId) return true;
    this.map[proofHash] = seen ?? taskId;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.map, null, 2));
    return false;
  }
}

/** Aturan deterministik atas isi byte file — untuk uji loop & demo tanpa API key.
 * SELALU berlabel [MOCK] di reasons; jangan dipakai untuk penilaian nyata. */
export class MockModelVerifier implements ModelVerifier {
  name = "mock";

  async evaluate(spec: HumanTaskSpec, proof: ProofImage): Promise<unknown> {
    const text = Buffer.from(proof.base64, "base64").toString("utf8");
    const challengeMatched = text.includes(spec.challenge);
    const requirementsMatched = !text.includes("BURUK");
    const ok = challengeMatched && requirementsMatched;
    return {
      challengeMatched,
      requirementsMatched,
      confidence: ok ? 0.95 : 0.2,
      decision: ok ? "APPROVE" : "REJECT",
      reasons: [
        ok
          ? "[MOCK] byte bukti mengandung kode tantangan"
          : challengeMatched
            ? "[MOCK] byte bukti mengandung penanda BURUK"
            : "[MOCK] kode tantangan tidak ditemukan di byte bukti",
      ],
    };
  }
}

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    challengeMatched: {
      type: "boolean",
      description: "Apakah kode tantangan task terlihat jelas TERTULIS di dalam foto",
    },
    requirementsMatched: {
      type: "boolean",
      description: "Apakah SEMUA kriteria penerimaan terpenuhi dari foto",
    },
    confidence: { type: "number", description: "Keyakinan 0..1 terhadap keputusan" },
    decision: { type: "string", enum: ["APPROVE", "REJECT"] },
    reasons: { type: "array", items: { type: "string" } },
  },
  required: ["challengeMatched", "requirementsMatched", "confidence", "decision", "reasons"],
  additionalProperties: false,
} as const;

/** Verifikasi produksi via Claude vision. Output tetap divalidasi parseModelVerdict
 * oleh pipeline — jangan pernah lewati validasi itu. */
export class AnthropicModelVerifier implements ModelVerifier {
  name: string;
  private client = new Anthropic();

  constructor(private readonly model: string) {
    this.name = `anthropic:${model}`;
  }

  async evaluate(spec: HumanTaskSpec, proof: ProofImage): Promise<unknown> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024, // output sengaja pendek: verdict JSON
      thinking: { type: "adaptive" },
      system: [
        "Kamu adalah verifikator MANDOR. Periksa foto bukti kerja terhadap kriteria task.",
        "PENTING: foto harus menampilkan kode tantangan yang TERTULIS (di kertas/layar) persis seperti yang diberikan — ini bukti foto diambil khusus untuk task ini, bukan foto lama.",
        "Tegas tapi adil. Screenshot, foto tidak relevan, atau kode tantangan tidak terlihat = REJECT.",
        "Kalau ragu, REJECT dengan confidence rendah — task dibuka lagi, dana tetap aman di escrow.",
        "Tulis reasons singkat dalam bahasa Indonesia (ditampilkan ke worker).",
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
                `Kode tantangan yang harus terlihat di foto: ${spec.challenge}`,
                `Kriteria penerimaan:`,
                ...spec.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`),
              ].join("\n"),
            },
          ],
        },
      ],
      output_config: { format: { type: "json_schema", schema: VERDICT_SCHEMA } },
    });

    if (response.stop_reason === "refusal") throw new Error("Model menolak permintaan (refusal)");
    if (response.stop_reason === "max_tokens") throw new Error("Output verifier terpotong");
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") throw new Error("Tidak ada text block di respons verifier");
    return JSON.parse(block.text);
  }
}

/** Verifikasi lewat endpoint mana pun yang kompatibel format OpenAI chat/completions
 * (OpenAI langsung, atau proxy seperti AI/ML API — api.aimlapi.com — yang meneruskan
 * ke banyak vendor lewat satu API). REST resmi via fetch, tidak menambah dependency.
 * Output tetap divalidasi parseModelVerdict — proxy TIDAK dipercaya buta. */
export class OpenAICompatibleVerifier implements ModelVerifier {
  name: string;

  constructor(
    private readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.openai.com/v1",
    vendorLabel = "openai",
  ) {
    this.name = `${vendorLabel}:${model}`;
  }

  async evaluate(spec: HumanTaskSpec, proof: ProofImage): Promise<unknown> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 600,
        response_format: {
          type: "json_schema",
          json_schema: { name: "verdict", strict: true, schema: VERDICT_SCHEMA },
        },
        messages: [
          {
            role: "system",
            content: [
              "Kamu adalah verifikator MANDOR. Periksa foto bukti kerja terhadap kriteria task.",
              "PENTING: foto harus menampilkan kode tantangan yang TERTULIS (di kertas/layar) persis seperti yang diberikan.",
              "Tegas tapi adil. Kalau ragu, REJECT dengan confidence rendah. Reasons dalam bahasa Indonesia.",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${proof.mediaType};base64,${proof.base64}` },
              },
              {
                type: "text",
                text: [
                  `Task: ${spec.title}`,
                  `Instruksi: ${spec.instructions}`,
                  `Kode tantangan yang harus terlihat di foto: ${spec.challenge}`,
                  `Kriteria penerimaan:`,
                  ...spec.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`),
                ].join("\n"),
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`${this.name} API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as {
      choices: { message: { content: string | null; refusal?: string | null } }[];
    };
    const msg = data.choices[0]?.message;
    if (!msg || msg.refusal) throw new Error(`Model menolak permintaan: ${msg?.refusal ?? "kosong"}`);
    if (!msg.content) throw new Error("Respons OpenAI kosong");
    return JSON.parse(msg.content);
  }
}

export interface EvaluateInput {
  taskId: string;
  spec: HumanTaskSpec;
  proof: ProofImage | null;
  proofHash: Hex;
  submittedAt: number;
  deadline: number;
}

export interface EvaluateOptions {
  model: ModelVerifier;
  registry: ProofRegistry;
  confidenceThreshold: number;
}

/** Pilih implementasi verifier dari config — satu-satunya tempat pemilihan vendor. */
export function createModelVerifier(cfg: {
  verifierProvider: "anthropic" | "openai" | "aimlapi" | "mock";
  verifierModel: string;
  openaiApiKey: string;
  openaiModel: string;
  aimlApiKey: string;
  aimlApiModel: string;
}): ModelVerifier {
  switch (cfg.verifierProvider) {
    case "mock":
      return new MockModelVerifier();
    case "openai":
      return new OpenAICompatibleVerifier(cfg.openaiModel, cfg.openaiApiKey);
    case "aimlapi":
      // Proxy OpenAI-compatible (banyak vendor lewat satu API) — https://aimlapi.com
      return new OpenAICompatibleVerifier(
        cfg.aimlApiModel,
        cfg.aimlApiKey,
        "https://api.aimlapi.com/v1",
        "aimlapi",
      );
    case "anthropic":
      return new AnthropicModelVerifier(cfg.verifierModel);
  }
}

function reject(input: EvaluateInput, reasons: string[], duplicateDetected = false): VerifierVerdict {
  return {
    taskId: input.taskId,
    challengeMatched: false,
    requirementsMatched: false,
    duplicateDetected,
    confidence: 0,
    decision: "REJECT",
    reasons,
    evidenceHash: input.proofHash,
  };
}

export async function evaluateProof(
  input: EvaluateInput,
  opts: EvaluateOptions,
): Promise<VerifierVerdict> {
  // Lapis 1 — cek deterministik (gratis, sebelum panggil model)
  if (!input.proof) return reject(input, ["File bukti tidak ditemukan di proof store"]);
  if (input.proof.base64.length > MAX_PROOF_BASE64_CHARS) {
    return reject(input, ["Ukuran file bukti melebihi batas 8 MB"]);
  }
  if (input.submittedAt > input.deadline) {
    return reject(input, ["Bukti dikirim melewati deadline task"]);
  }
  if (opts.registry.checkAndRecord(input.proofHash, input.taskId)) {
    return reject(input, ["Foto ini sudah pernah dipakai untuk task lain (duplikat)"], true);
  }

  // Lapis 2 — evaluasi model. Error jaringan/API dilempar ke atas (loop yang
  // memutuskan retry); output yang berhasil tapi malformed = REJECT fail-safe.
  const raw = await opts.model.evaluate(input.spec, input.proof);
  let model: ModelVerdict;
  try {
    model = parseModelVerdict(raw);
  } catch (err) {
    return reject(input, [`Output verifier tidak valid: ${(err as Error).message}`]);
  }

  // Lapis 3 — gating fail-safe di atas keputusan model
  const gateReasons: string[] = [];
  if (model.decision !== "APPROVE") gateReasons.push(...model.reasons);
  if (!model.challengeMatched) gateReasons.push("Kode tantangan tidak terlihat di foto");
  if (!model.requirementsMatched) gateReasons.push("Kriteria task belum terpenuhi");
  if (model.confidence < opts.confidenceThreshold) {
    gateReasons.push(
      `Confidence ${model.confidence.toFixed(2)} di bawah ambang ${opts.confidenceThreshold}`,
    );
  }

  const approved = gateReasons.length === 0;
  return {
    taskId: input.taskId,
    ...model,
    decision: approved ? "APPROVE" : "REJECT",
    reasons: approved ? model.reasons : gateReasons,
    duplicateDetected: false,
    evidenceHash: input.proofHash,
  };
}
