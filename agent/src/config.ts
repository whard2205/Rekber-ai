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
function localDeployment(): { escrow: string; idrx: string } | null {
  const p = path.join(here, "..", "..", "contracts", "deployments", "localhost.json");
  if (!fs.existsSync(p)) return null;
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  return { escrow: d.escrow, idrx: d.idrx };
}

const chainId = Number(process.env.CHAIN_ID || 31337);
const local = chainId === 31337 ? localDeployment() : null;

export const config = {
  rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
  chainId,
  agentPrivateKey: required("AGENT_PRIVATE_KEY") as `0x${string}`,
  escrowAddress: (process.env.ESCROW_ADDRESS || local?.escrow || "") as `0x${string}`,
  tokenAddress: (process.env.TOKEN_ADDRESS || local?.idrx || "") as `0x${string}`,
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
  // Verifikasi boleh pakai model berbeda dari planning (mis. lebih murah).
  verifierModel: process.env.VERIFIER_MODEL || process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
  mockBrain: process.env.MANDOR_MOCK_BRAIN === "1",
  // Provider verifikasi: anthropic | openai | aimlapi | mock.
  // Default mengikuti MANDOR_MOCK_BRAIN; bisa dipisah (mis. planning mock + verifikasi aimlapi/openai).
  verifierProvider: (process.env.VERIFIER_PROVIDER ||
    (process.env.MANDOR_MOCK_BRAIN === "1" ? "mock" : "anthropic")) as
    | "anthropic"
    | "openai"
    | "aimlapi"
    | "mock",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o",
  // AI/ML API (https://aimlapi.com) — proxy OpenAI-compatible ke banyak vendor (GPT-4o, Claude, dll).
  aimlApiKey: process.env.AIMLAPI_API_KEY || "",
  aimlApiModel: process.env.AIMLAPI_MODEL || "gpt-4o",
  // APPROVE butuh confidence model >= ambang ini (gating fail-safe).
  confidenceThreshold: Number(process.env.CONFIDENCE_THRESHOLD || 0.8),
  // Batas percobaan verifikasi per task — anti spam resubmission membakar API.
  maxVerificationsPerTask: Number(process.env.MAX_VERIFICATIONS_PER_TASK || 5),
  taskDeadlineMinutes: Number(process.env.TASK_DEADLINE_MINUTES || 60),
  proofDir: path.resolve(here, "..", process.env.PROOF_DIR || "../worker-app/uploads"),
};

if (!config.escrowAddress || !config.tokenAddress) {
  throw new Error("ESCROW_ADDRESS/TOKEN_ADDRESS belum diset dan deployments/localhost.json tidak ditemukan");
}
if (!config.mockBrain && !process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY wajib diisi (atau set MANDOR_MOCK_BRAIN=1 untuk uji loop offline)");
}
if (config.verifierProvider === "openai" && !config.openaiApiKey) {
  throw new Error("VERIFIER_PROVIDER=openai butuh OPENAI_API_KEY");
}
if (config.verifierProvider === "aimlapi" && !config.aimlApiKey) {
  throw new Error("VERIFIER_PROVIDER=aimlapi butuh AIMLAPI_API_KEY");
}
if (config.verifierProvider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
  throw new Error("VERIFIER_PROVIDER=anthropic butuh ANTHROPIC_API_KEY");
}
