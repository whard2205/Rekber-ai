"use client";

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const STORAGE_KEY = "mandor-worker-wallet";

export interface WorkerWallet {
  address: `0x${string}`;
  privateKey: `0x${string}`;
}

/** Burner wallet lokal (v0): kunci privat dibuat di browser, disimpan di localStorage,
 * tidak pernah dikirim ke server. Hanya address yang dikirim ke API untuk claim/submit.
 * Upgrade path: Privy embedded wallet, lihat BLUEPRINT.md. */
export function getOrCreateWallet(): WorkerWallet {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw) return JSON.parse(raw) as WorkerWallet;

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const wallet: WorkerWallet = { address: account.address, privateKey };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet));
  return wallet;
}
