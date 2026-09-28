/** Abstraksi provider AI multi-gambar — dipakai judge.ts (hakim sengketa) dan shipment.ts
 * (cek pengiriman). Provider TIDAK divalidasi apa-apa di sini; pemanggil (judge/shipment)
 * yang wajib memvalidasi schema output sebelum dipakai untuk aksi finansial apa pun —
 * pola sama dengan parseModelVerdict di MANDOR (agent/src/verifier.ts, tag mandor-final). */
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import type { ImageInput } from "./types.js";

export interface AiProvider {
  name: string;
  /** Setiap gambar didahului satu blok teks label ("Foto 3 — packing dari penjual")
   * supaya model tahu peran tiap foto — bukan sekadar tumpukan gambar tanpa konteks. */
  evaluate(system: string, userText: string, images: ImageInput[], schema: Record<string, unknown>): Promise<unknown>;
}

export class AnthropicProvider implements AiProvider {
  name: string;
  private client = new Anthropic();

  constructor(private readonly model: string) {
    this.name = `anthropic:${model}`;
  }

  async evaluate(system: string, userText: string, images: ImageInput[], schema: Record<string, unknown>): Promise<unknown> {
    const content: Anthropic.ContentBlockParam[] = [];
    for (const img of images) {
      content.push({ type: "text", text: img.label });
      content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } });
    }
    content.push({ type: "text", text: userText });

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      system,
      messages: [{ role: "user", content }],
      // Klasifikasi terstruktur, bukan reasoning berat — effort rendah demi latensi
      // (pelajaran MANDOR O-13), tanpa mengorbankan kualitas untuk tugas sesederhana ini.
      output_config: { effort: "low", format: { type: "json_schema", schema } },
    });

    if (response.stop_reason === "refusal") throw new Error("Model menolak permintaan (refusal)");
    if (response.stop_reason === "max_tokens") throw new Error("Output terpotong (max_tokens)");
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") throw new Error("Tidak ada text block di respons");
    return JSON.parse(block.text);
  }
}

/** Endpoint kompatibel OpenAI chat/completions — OpenAI langsung atau proxy seperti
 * AI/ML API (aimlapi) yang meneruskan ke banyak vendor lewat satu API. REST via fetch,
 * tanpa dependency tambahan. */
export class OpenAICompatibleProvider implements AiProvider {
  name: string;

  constructor(
    private readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.openai.com/v1",
    vendorLabel = "openai",
  ) {
    this.name = `${vendorLabel}:${model}`;
  }

  async evaluate(system: string, userText: string, images: ImageInput[], schema: Record<string, unknown>): Promise<unknown> {
    const content: Record<string, unknown>[] = [];
    for (const img of images) {
      content.push({ type: "text", text: img.label });
      content.push({ type: "image_url", image_url: { url: `data:${img.mediaType};base64,${img.base64}` } });
    }
    content.push({ type: "text", text: userText });

    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 700,
        response_format: {
          type: "json_schema",
          json_schema: { name: "verdict", strict: true, schema },
        },
        messages: [
          { role: "system", content: system },
          { role: "user", content },
        ],
      }),
    });
    if (!res.ok) throw new Error(`${this.name} API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as {
      choices: { message: { content: string | null; refusal?: string | null } }[];
    };
    const msg = data.choices[0]?.message;
    if (!msg || msg.refusal) throw new Error(`Model menolak permintaan: ${msg?.refusal ?? "kosong"}`);
    if (!msg.content) throw new Error("Respons kosong");
    return JSON.parse(msg.content);
  }
}

/** Pilih implementasi provider dari config. null = mock (judge.ts/shipment.ts punya logika
 * mock deterministik sendiri, bukan lewat AiProvider — lihat komentar di masing-masing). */
export function createAiProvider(cfg: typeof config): AiProvider | null {
  switch (cfg.aiProvider) {
    case "mock":
      return null;
    case "anthropic":
      return new AnthropicProvider(cfg.aiModel || "claude-opus-4-8");
    case "openai":
      return new OpenAICompatibleProvider(cfg.aiModel || cfg.openaiModel, cfg.openaiApiKey);
    case "aimlapi":
      return new OpenAICompatibleProvider(
        cfg.aiModel || cfg.aimlApiModel,
        cfg.aimlApiKey,
        "https://api.aimlapi.com/v1",
        "aimlapi",
      );
  }
}
