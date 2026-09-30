/** Skrip arbiter manusia — dijalankan manual saat ada deal Disputed/Escalated yang butuh
 * keputusan manusia (AI eskalasi karena ragu, atau AI gagal berulang).
 *
 * Sengaja TIDAK memakai agent/src/config.ts (yang mewajibkan AI_ARBITER_PRIVATE_KEY) —
 * arbiter manusia harus bisa menjalankan skrip ini tanpa kunci AI sama sekali, jadi ABI
 * loading + viem client dibuat sendiri di sini (pola sama dengan fake-worker.ts MANDOR,
 * tag mandor-final).
 *
 * Pakai: tsx scripts/human-resolve.ts <dealCode> refund|release "<alasan>"
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, defineChain, keccak256, toHex, type Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat, base, baseSepolia, bsc, bscTestnet } from "viem/chains";
import { appendAuditLog, readDeal, readVerdict, writeVerdict } from "../src/store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const escrowAbi: Abi = JSON.parse(fs.readFileSync(path.join(here, "..", "src", "abi", "RekberEscrow.json"), "utf8"));

const KNOWN_CHAINS: Record<number, typeof hardhat> = {
  31337: hardhat,
  56: bsc as never,
  97: bscTestnet as never,
  8453: base as never,
  84532: baseSepolia as never,
};

function resolveChain(chainId: number, rpcUrl: string) {
  return (
    KNOWN_CHAINS[chainId] ??
    defineChain({
      id: chainId,
      name: `chain-${chainId}`,
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    })
  );
}

function loadEscrowAddress(): `0x${string}` {
  if (process.env.ESCROW_ADDRESS) return process.env.ESCROW_ADDRESS as `0x${string}`;
  const p = path.join(here, "..", "..", "contracts", "deployments", "localhost.json");
  if (!fs.existsSync(p)) throw new Error("ESCROW_ADDRESS belum diset dan deployments/localhost.json tidak ditemukan");
  return (JSON.parse(fs.readFileSync(p, "utf8")) as { escrow: `0x${string}` }).escrow;
}

async function main() {
  const [dealCode, decisionArg, reason] = process.argv.slice(2);
  if (!dealCode || !decisionArg || !reason) {
    console.error('Pakai: tsx scripts/human-resolve.ts <dealCode> refund|release "<alasan>"');
    process.exit(1);
  }
  if (decisionArg !== "refund" && decisionArg !== "release") {
    console.error('Keputusan harus "refund" atau "release"');
    process.exit(1);
  }

  const privateKey = process.env.HUMAN_ARBITER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!privateKey) throw new Error("HUMAN_ARBITER_PRIVATE_KEY wajib diisi (lihat .env.example)");

  const deal = await readDeal(dealCode);
  if (!deal) throw new Error(`Deal ${dealCode} tidak ditemukan`);

  const chainId = Number(process.env.CHAIN_ID || 31337);
  const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
  const escrow = loadEscrowAddress();
  const chain = resolveChain(chainId, rpcUrl);
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  const outcome = decisionArg === "refund" ? "REFUND" : "RELEASE";
  // Field & urutan key PERSIS sama dengan judge.ts buildCommit (docs/rekber-ai/PLAN.md §3.3)
  // supaya siapa pun bisa menghitung ulang verdictHash dengan cara yang sama.
  const commit = {
    dealId: deal.dealId,
    dealCode: deal.dealCode,
    outcome,
    confidence: 1,
    reasons: [reason],
    evidence: {
      specHash: deal.specHash,
      shipmentHash: deal.shipment?.shipmentHash ?? null,
      disputeHash: deal.dispute?.disputeHash ?? null,
      responseHash: deal.sellerResponse?.responseHash ?? null,
    },
    model: "human",
    decidedAt: new Date().toISOString(),
  };
  const verdictHash = keccak256(toHex(JSON.stringify(commit))) as Hex;

  console.log(`⚖️  Arbiter manusia (${account.address}) memutus ${dealCode}: ${outcome}`);
  console.log(`   Alasan: ${reason}`);

  const { request } = await publicClient.simulateContract({
    account,
    address: escrow,
    abi: escrowAbi,
    functionName: "resolve",
    args: [deal.dealId as Hex, outcome === "REFUND", verdictHash],
  });
  const hash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  const existing = ((await readVerdict(dealCode)) as Record<string, unknown> | null) ?? {};
  await writeVerdict(dealCode, { ...existing, commit, verdictHash, txHash: receipt.transactionHash });
  await appendAuditLog({
    ts: new Date().toISOString(),
    dealCode,
    dealId: deal.dealId,
    outcome,
    verdictHash,
    txHash: receipt.transactionHash,
    commit,
  });

  console.log(`✅ Selesai — tx ${receipt.transactionHash}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
