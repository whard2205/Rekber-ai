"use client";

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const STORAGE_KEY = "rekber-ai-wallet";

export interface UserWallet {
  address: `0x${string}`;
  privateKey: `0x${string}`;
}

/** Burner wallet lokal (v0): kunci privat dibuat di browser, disimpan di localStorage,
 * tidak pernah dikirim ke server. Hanya address & tanda tangan yang dikirim ke API.
 * Satu wallet dipakai untuk peran pembeli maupun penjual — tidak ada login.
 * Upgrade path: Privy embedded wallet, lihat docs/rekber-ai/BLUEPRINT.md §13. */
export function getOrCreateWallet(): UserWallet {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw) return JSON.parse(raw) as UserWallet;

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const wallet: UserWallet = { address: account.address, privateKey };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet));
  return wallet;
}
