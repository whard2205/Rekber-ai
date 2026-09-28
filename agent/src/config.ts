import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Env ${name} wajib diisi (lihat .env.example)`);
  return v;
}

// Fallback alamat kontrak dari hasil deploy lokal, biar DX enak saat development.
function localDeployment(): { escrow: string; token: string } | null {
  const p = path.join(here, "..", "..", "contracts", "deployments", "localhost.json");
  if (!fs.existsSync(p)) return null;
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  return { escrow: d.escrow, token: d.token };
}

const chainId = Number(process.env.CHAIN_ID || 31337);
const local = chainId === 31337 ? localDeployment() : null;

export const config = {
  rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
  chainId,
  aiArbiterPrivateKey: required("AI_ARBITER_PRIVATE_KEY") as `0x${string}`,
  escrowAddress: (process.env.ESCROW_ADDRESS || local?.escrow || "") as `0x${string}`,
  tokenAddress: (process.env.TOKEN_ADDRESS || local?.token || "") as `0x${string}`,
  // Dibagi dengan web/ — web menulis deal & bukti, agent hanya baca + tulis verdict/audit log.
  dataDir: path.resolve(here, "..", process.env.DATA_DIR || "../data"),
  // Provider AI: anthropic | openai | aimlapi | mock (default mock — harus disetel eksplisit
  // untuk demo nyata, supaya lupa isi API key tidak diam-diam jatuh ke mock).
  aiProvider: (process.env.AI_PROVIDER || "mock") as "anthropic" | "openai" | "aimlapi" | "mock",
  aiModel: process.env.AI_MODEL || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o",
  aimlApiKey: process.env.AIMLAPI_API_KEY || "",
  aimlApiModel: process.env.AIMLAPI_MODEL || "gpt-4o",
  // REFUND/RELEASE butuh confidence model >= ambang ini; di bawahnya -> ESCALATE (fail-safe).
  confidenceThreshold: Number(process.env.CONFIDENCE_THRESHOLD || 0.85),
  // Tunggu tanggapan penjual maksimal sekian detik sebelum hakim memutus tanpa tanggapan.
  sellerResponseSeconds: Number(process.env.SELLER_RESPONSE_SECONDS || 60),
  pollMs: Number(process.env.POLL_MS || 3000),
};

if (!config.escrowAddress || !config.tokenAddress) {
  throw new Error("ESCROW_ADDRESS/TOKEN_ADDRESS belum diset dan deployments/localhost.json tidak ditemukan");
}
if (config.aiProvider === "anthropic" && !config.anthropicApiKey) {
  throw new Error("AI_PROVIDER=anthropic butuh ANTHROPIC_API_KEY");
}
if (config.aiProvider === "openai" && !config.openaiApiKey) {
  throw new Error("AI_PROVIDER=openai butuh OPENAI_API_KEY");
}
if (config.aiProvider === "aimlapi" && !config.aimlApiKey) {
  throw new Error("AI_PROVIDER=aimlapi butuh AIMLAPI_API_KEY");
}
