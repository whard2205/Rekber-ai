import "server-only";
import { config } from "./config";

/** Ekstraksi checklist (docs/rekber-ai/PLAN.md §3.4a) — saat penjual membuat transaksi.
 * Ini HANYA bantuan penulisan (janji penjual final tetap bisa diedit di UI), BUKAN keputusan
 * finansial — jadi fail-safe-nya beda dari judge.ts: gagal apa pun alasannya cukup jatuh ke
 * checklist mock sederhana, jangan sampai memblokir penjual membuat transaksi. */

export interface ChecklistResult {
  checklist: string[];
  warnings: string[];
}

const CHECKLIST_SCHEMA = {
  type: "object",
  properties: {
    checklist: {
      type: "array",
      items: { type: "string" },
      description: "3-8 poin spesifikasi objektif yang bisa dicek dari satu foto (warna, ukuran, kondisi, kelengkapan)",
    },
    warnings: { type: "array", items: { type: "string" }, description: "mis. deskripsi terlalu umum untuk dibuat checklist berarti" },
  },
  required: ["checklist", "warnings"],
  additionalProperties: false,
} as const;

const SYSTEM = [
  "Kamu membantu penjual di Rekber AI menulis 'janji penjual' — checklist spesifikasi OBJEKTIF yang bisa dicek dari satu foto.",
  "Ubah judul & deskripsi barang jadi 3-8 poin singkat, konkret, bisa diverifikasi secara visual — bukan opini ('bagus', 'mulus' tanpa detail apa yang membuatnya mulus).",
  "Kalau deskripsi terlalu umum untuk dibuat checklist yang berarti, tulis di warnings dan buat checklist seadanya dari yang tersedia.",
  "Bahasa Indonesia, singkat.",
].join("\n");

function mockChecklist(description: string): ChecklistResult {
  const checklist = description
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { checklist: checklist.length ? checklist : [`[MOCK] ${description}`], warnings: [] };
}

function isChecklistResult(v: unknown): v is ChecklistResult {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return Array.isArray(r.checklist) && r.checklist.every((c) => typeof c === "string");
}

export async function extractChecklist(title: string, description: string): Promise<ChecklistResult> {
  if (config.aiProvider === "mock") return mockChecklist(description);

  const baseUrl =
    config.aiBaseUrl || (config.aiProvider === "aimlapi" ? "https://api.aimlapi.com/v1" : "https://api.openai.com/v1");

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.aiApiKey}` },
      body: JSON.stringify({
        model: config.aiModel,
        max_tokens: 400,
        response_format: { type: "json_schema", json_schema: { name: "checklist", strict: true, schema: CHECKLIST_SCHEMA } },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Judul: ${title}\nDeskripsi: ${description}` },
        ],
      }),
    });
    if (!res.ok) return mockChecklist(description);
    const data = (await res.json()) as { choices: { message: { content: string | null; refusal?: string | null } }[] };
    const msg = data.choices[0]?.message;
    if (!msg?.content || msg.refusal) return mockChecklist(description);
    const parsed = JSON.parse(msg.content) as unknown;
    if (!isChecklistResult(parsed)) return mockChecklist(description);
    const warnings = Array.isArray((parsed as { warnings?: unknown }).warnings)
      ? (parsed as { warnings: unknown[] }).warnings.filter((w): w is string => typeof w === "string")
      : [];
    return { checklist: parsed.checklist, warnings };
  } catch {
    return mockChecklist(description);
  }
}
