import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, defineChain, type Abi, type Address, type Hex } from "viem";
import { nonceManager, privateKeyToAccount } from "viem/accounts";
import { hardhat, base, baseSepolia, bsc, bscTestnet } from "viem/chains";
import { config } from "./config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const loadAbi = (name: string): Abi => JSON.parse(fs.readFileSync(path.join(here, "abi", `${name}.json`), "utf8"));

export const escrowAbi = loadAbi("RekberEscrow");

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
// nonceManager: jaring pengaman kalau loop memproses beberapa deal "bersamaan" di masa depan
// (saat ini sekuensial per tick, jadi tidak wajib, tapi murah dan aman — pelajaran MANDOR O-08).
export const account = privateKeyToAccount(config.aiArbiterPrivateKey, { nonceManager });
export const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
export const walletClient = createWalletClient({ account, chain, transport: http(config.rpcUrl) });

// Status enum harus sinkron dengan RekberEscrow.sol
export const Status = {
  None: 0,
  Funded: 1,
  Shipped: 2,
  Disputed: 3,
  Escalated: 4,
  Released: 5,
  Refunded: 6,
  Split: 7,
} as const;

export interface OnchainDeal {
  buyer: Address;
  seller: Address;
  amount: bigint;
  fundedAt: number;
  shippedAt: number;
  disputedAt: number;
  status: number;
  specHash: Hex;
  shipmentHash: Hex;
  disputeHash: Hex;
  verdictHash: Hex;
}

async function write(functionName: string, args: unknown[]) {
  const { request } = await publicClient.simulateContract({
    account,
    address: config.escrowAddress,
    abi: escrowAbi,
    functionName,
    args,
  });
  const hash = await walletClient.writeContract(request);
  return publicClient.waitForTransactionReceipt({ hash });
}

export async function getDeal(dealId: Hex): Promise<OnchainDeal> {
  return (await publicClient.readContract({
    address: config.escrowAddress,
    abi: escrowAbi,
    functionName: "getDeal",
    args: [dealId],
  })) as OnchainDeal;
}

/** AI arbiter memutus sengketa: refundBuyer=true -> REFUND, false -> RELEASE. */
export async function resolve(dealId: Hex, refundBuyer: boolean, verdictHash: Hex) {
  return write("resolve", [dealId, refundBuyer, verdictHash]);
}

/** AI arbiter melempar kasus ke manusia (ragu / output rusak). */
export async function escalate(dealId: Hex, verdictHash: Hex) {
  return write("escalate", [dealId, verdictHash]);
}
