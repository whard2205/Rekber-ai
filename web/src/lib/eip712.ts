// Definisi EIP-712 TUNGGAL, dipakai client (tanda tangan, browser) DAN server (verifikasi,
// route API) — field & urutan HARUS PERSIS sama dengan typehash di RekberEscrow.sol
// (docs/rekber-ai/PLAN.md §3.2). TIDAK "server-only" — file ini diimpor dari client component.

export const rekberDomain = {
  name: "RekberEscrow",
  version: "1",
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 31337),
  verifyingContract: (process.env.NEXT_PUBLIC_ESCROW_ADDRESS || "") as `0x${string}`,
} as const;

export const permitDomain = {
  name: "Mock IDRX",
  version: "1",
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 31337),
  verifyingContract: (process.env.NEXT_PUBLIC_TOKEN_ADDRESS || "") as `0x${string}`,
} as const;

export const OFFER_TYPES = {
  Offer: [
    { name: "dealId", type: "bytes32" },
    { name: "seller", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "specHash", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const FUND_TYPES = {
  Fund: [
    { name: "dealId", type: "bytes32" },
    { name: "buyer", type: "address" },
    { name: "seller", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "specHash", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const ACT_TYPES = {
  Act: [
    { name: "dealId", type: "bytes32" },
    { name: "action", type: "uint8" },
    { name: "data", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** Urutan sinkron dengan enum Action di RekberEscrow.sol. */
export const Action = { Ship: 0, Confirm: 1, Dispute: 2 } as const;

/** Deadline tanda tangan default — sekarang + 10 menit (docs/rekber-ai/PLAN.md §3.6). */
export function signatureDeadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + 600);
}
