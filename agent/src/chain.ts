import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  parseEventLogs,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { nonceManager, privateKeyToAccount } from "viem/accounts";
import { hardhat, base, baseSepolia, bsc, bscTestnet } from "viem/chains";
import { config } from "./config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const loadAbi = (name: string): Abi =>
  JSON.parse(fs.readFileSync(path.join(here, "abi", `${name}.json`), "utf8"));

export const escrowAbi = loadAbi("TaskEscrow");
export const idrxAbi = loadAbi("MockIDRX");

const KNOWN_CHAINS: Record<number, typeof hardhat> = {
  31337: hardhat,
  56: bsc as never,
  97: bscTestnet as never,
  8453: base as never,
  84532: baseSepolia as never,
};

export function resolveChain(chainId: number, rpcUrl: string) {
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

const chain = resolveChain(config.chainId, config.rpcUrl);
// O-08: nonceManager sebagai jaring pengaman kalau loop pemrosesan task berubah jadi
// paralel di masa depan (saat ini sekuensial, jadi tidak wajib, tapi murah dan aman).
export const account = privateKeyToAccount(config.agentPrivateKey, { nonceManager });
export const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
export const walletClient = createWalletClient({ account, chain, transport: http(config.rpcUrl) });

// Status enum harus sinkron dengan TaskEscrow.sol
export const Status = { None: 0, Open: 1, Claimed: 2, Submitted: 3, Paid: 4, Refunded: 5 } as const;

export interface OnchainTask {
  agent: Address;
  token: Address;
  bounty: bigint;
  specHash: Hex;
  worker: Address;
  proofHash: Hex;
  deadline: number;
  submittedAt: number;
  status: number;
}

async function write(address: Address, abi: Abi, functionName: string, args: unknown[]) {
  const { request } = await publicClient.simulateContract({
    account,
    address,
    abi,
    functionName,
    args,
  });
  const hash = await walletClient.writeContract(request);
  return publicClient.waitForTransactionReceipt({ hash });
}

export async function approveToken(amount: bigint) {
  return write(config.tokenAddress, idrxAbi, "approve", [config.escrowAddress, amount]);
}

export async function tokenBalance(owner: Address): Promise<bigint> {
  return (await publicClient.readContract({
    address: config.tokenAddress,
    abi: idrxAbi,
    functionName: "balanceOf",
    args: [owner],
  })) as bigint;
}

/** Post task ke escrow, return taskId dari event TaskPosted. */
export async function postTask(bounty: bigint, specHash: Hex, deadline: number): Promise<bigint> {
  const receipt = await write(config.escrowAddress, escrowAbi, "postTask", [
    config.tokenAddress,
    bounty,
    specHash,
    deadline,
  ]);
  // O-12: taskId diparsing langsung dari receipt.logs, bukan query eth_getLogs terpisah —
  // public RPC di-load-balance bisa tertinggal satu node dan gagal menemukan event yang
  // baru saja di-mine di node lain. parseEventLogs tidak butuh panggilan RPC tambahan.
  const [mine] = parseEventLogs({ abi: escrowAbi, eventName: "TaskPosted", logs: receipt.logs });
  if (!mine) throw new Error("TaskPosted event tidak ditemukan di receipt");
  return (mine.args as { taskId: bigint }).taskId;
}

export async function getTask(taskId: bigint): Promise<OnchainTask> {
  return (await publicClient.readContract({
    address: config.escrowAddress,
    abi: escrowAbi,
    functionName: "getTask",
    args: [taskId],
  })) as OnchainTask;
}

/** O-09: verdictHash = keccak256 dari verdict verifikasi, dikomit on-chain lewat event
 * BountyReleased sehingga bisa dicocokkan publik terhadap missions/audit-log.jsonl. */
export async function releaseBounty(taskId: bigint, verdictHash: Hex) {
  return write(config.escrowAddress, escrowAbi, "releaseBounty", [taskId, verdictHash]);
}

export async function rejectAndReopen(taskId: bigint, verdictHash: Hex) {
  return write(config.escrowAddress, escrowAbi, "rejectAndReopen", [taskId, verdictHash]);
}
