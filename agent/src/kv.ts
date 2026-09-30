/** Upstash Redis lewat REST — pasangan web/src/lib/kv.ts (kunci & format data harus sama).
 * Env dibaca saat dipanggil (bukan saat import), karena dotenv baru dimuat oleh config.ts /
 * skrip pemanggil. Tanpa env ini → penyimpanan file lokal (data/). */
const env = () => ({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const kvEnabled = () => !!(env().url && env().token);
export const kvKey = (name: string) => `rekber:${process.env.CHAIN_ID || 31337}:${name}`;

export async function kv<T = unknown>(...cmd: (string | number)[]): Promise<T> {
  const { url, token } = env();
  const res = await fetch(url!, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(cmd) });
  const body = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
  if (!res.ok || body.error) throw new Error(`Redis ${cmd[0]} gagal: ${body.error ?? res.status}`);
  return body.result as T;
}
