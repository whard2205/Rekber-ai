import "server-only";

/** Upstash Redis lewat REST (tanpa dependency): dipakai saat jalan di Vercel, di mana
 * filesystem read-only & tidak dibagi antar-instance. Tanpa env ini → penyimpanan file
 * lokal (data/), untuk development + smoke test. Agent memakai Redis yang SAMA
 * (agent/src/kv.ts) — kunci diawali chainId supaya data testnet/lokal tidak tercampur. */
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const kvEnabled = !!(url && token);
export const kvKey = (name: string) => `rekber:${process.env.CHAIN_ID || 31337}:${name}`;

export async function kv<T = unknown>(...cmd: (string | number)[]): Promise<T> {
  const res = await fetch(url!, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
  if (!res.ok || body.error) throw new Error(`Redis ${cmd[0]} gagal: ${body.error ?? res.status}`);
  return body.result as T;
}
