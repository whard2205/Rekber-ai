import "server-only";
import fs from "node:fs";
import path from "node:path";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Env ${name} wajib diisi (lihat .env.example)`);
  return v;
}

// Fallback alamat kontrak dari hasil deploy lokal, biar DX enak saat development.
function localDeployment(): { escrow: string; idrx: string } | null {
  const p = path.join(process.cwd(), "..", "contracts", "deployments", "localhost.json");
  if (!fs.existsSync(p)) return null;
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  return { escrow: d.escrow, idrx: d.idrx };
}

const chainId = Number(process.env.CHAIN_ID || 31337);
const local = chainId === 31337 ? localDeployment() : null;

export const config = {
  rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
  chainId,
  relayerPrivateKey: required("RELAYER_PRIVATE_KEY") as `0x${string}`,
  escrowAddress: (process.env.ESCROW_ADDRESS || local?.escrow || "") as `0x${string}`,
  tokenAddress: (process.env.TOKEN_ADDRESS || local?.idrx || "") as `0x${string}`,
  missionsFile: path.resolve(process.cwd(), process.env.MISSIONS_FILE || "../agent/missions/current.json"),
  uploadsDir: path.resolve(process.cwd(), process.env.UPLOADS_DIR || "./uploads"),
};

if (!config.escrowAddress || !config.tokenAddress) {
  throw new Error("ESCROW_ADDRESS/TOKEN_ADDRESS belum diset dan deployments/localhost.json tidak ditemukan");
}

fs.mkdirSync(config.uploadsDir, { recursive: true });
