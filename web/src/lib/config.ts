import "server-only";
import fs from "node:fs";
import path from "node:path";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Env ${name} wajib diisi (lihat .env.example)`);
  return v;
}

// Fallback alamat kontrak dari hasil deploy lokal, biar DX enak saat development.
function localDeployment(): { escrow: string; token: string } | null {
  const p = path.join(process.cwd(), "..", "contracts", "deployments", "localhost.json");
  if (!fs.existsSync(p)) return null;
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  return { escrow: d.escrow, token: d.token };
}

const chainId = Number(process.env.CHAIN_ID || 31337);
const local = chainId === 31337 ? localDeployment() : null;

export const config = {
  rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
  chainId,
  relayerPrivateKey: required("RELAYER_PRIVATE_KEY") as `0x${string}`,
  escrowAddress: (process.env.ESCROW_ADDRESS || local?.escrow || "") as `0x${string}`,
  tokenAddress: (process.env.TOKEN_ADDRESS || local?.token || "") as `0x${string}`,
  // Dibagi dengan agent/ — web menulis deals/evidence, agent menulis verdicts/audit-log.
  dataDir: path.resolve(process.cwd(), process.env.DATA_DIR || "../data"),
  // Provider AI untuk ekstraksi checklist saat penjual membuat transaksi (§3.4a).
  aiProvider: (process.env.AI_PROVIDER || "mock") as "openai" | "aimlapi" | "mock",
  aiBaseUrl: process.env.AI_BASE_URL || "",
  aiApiKey: process.env.AI_API_KEY || "",
  aiModel: process.env.AI_MODEL || "gpt-4o",
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 6),
  faucetEnabled: process.env.FAUCET_ENABLED !== "0",
  // Nilai tampilan saja (bukan on-chain) — dipakai untuk countdown "menunggu tanggapan
  // penjual" di UI. Sinkronkan dengan SELLER_RESPONSE_SECONDS di agent/.env.
  sellerResponseSeconds: Number(process.env.SELLER_RESPONSE_SECONDS || 60),
};

if (!config.escrowAddress || !config.tokenAddress) {
  throw new Error("ESCROW_ADDRESS/TOKEN_ADDRESS belum diset dan deployments/localhost.json tidak ditemukan");
}

