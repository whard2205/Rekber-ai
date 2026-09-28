/** Daemon AI arbiter (docs/rekber-ai/PLAN.md §3.5). Loop tiap POLL_MS: cek pengiriman
 * begitu Shipped, putus sengketa begitu Disputed + tanggapan penjual ada/lewat batas waktu.
 * Tiap deal diproses dalam try/catch sendiri (pelajaran MANDOR O-04) — satu deal error tidak
 * menghentikan daemon. */
import path from "node:path";
import type { Hex } from "viem";
import { config } from "./config.js";
import { account, escalate, getDeal, resolve, Status, type OnchainDeal } from "./chain.js";
import { createAiProvider, type AiProvider } from "./ai.js";
import { checkShipment, type ShipmentCheck } from "./shipment.js";
import { judgeDispute, buildEscalateVerdict, type JudgeCommit, type JudgeOutcome, type RawJudgeOutput } from "./judge.js";
import { listDeals, loadEvidenceImage, writeVerdict, readVerdict, appendAuditLog } from "./store.js";
import { PhotoRegistry } from "./registry.js";
import type { DealRecord, ImageInput } from "./types.js";

const MAX_API_RETRIES = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface VerdictFile {
  shipmentCheck?: ShipmentCheck;
  commit?: JudgeCommit;
  verdictHash?: Hex;
  txHash?: string;
  raw?: RawJudgeOutput | null;
}

function readVerdictFile(dealCode: string): VerdictFile {
  return (readVerdict(dealCode) as VerdictFile | null) ?? {};
}

interface ImageSection {
  photos: (string | null | undefined)[];
  label: string;
}

/** Nomori & beri label tiap foto sebelum dikirim ke model vision — supaya model tahu peran
 * tiap foto ("Foto 3 — packing dari penjual"), bukan sekadar tumpukan gambar tanpa konteks. */
function buildImages(sections: ImageSection[]): ImageInput[] {
  const images: ImageInput[] = [];
  let n = 1;
  for (const section of sections) {
    for (const filename of section.photos) {
      if (!filename) continue;
      const img = loadEvidenceImage(filename, `Foto ${n} — ${section.label}`);
      if (img) {
        images.push(img);
        n++;
      }
    }
  }
  return images;
}

function shipmentImages(deal: DealRecord): ImageInput[] {
  return buildImages([
    { photos: deal.spec.listingPhotos, label: "listing dari penjual" },
    { photos: deal.shipment?.packingPhotos ?? [], label: "packing dari penjual (bukti kirim)" },
    { photos: [deal.shipment?.resiPhoto], label: "foto resi" },
  ]);
}

function judgeImages(deal: DealRecord): ImageInput[] {
  return buildImages([
    { photos: deal.spec.listingPhotos, label: "listing dari penjual" },
    { photos: deal.shipment?.packingPhotos ?? [], label: "packing dari penjual (bukti kirim)" },
    { photos: [deal.shipment?.resiPhoto], label: "foto resi" },
    { photos: deal.dispute?.photos ?? [], label: "unboxing dari pembeli (komplain)" },
    { photos: deal.sellerResponse?.photos ?? [], label: "tanggapan penjual" },
  ]);
}

async function maybeCheckShipment(deal: DealRecord, provider: AiProvider | null): Promise<void> {
  const existing = readVerdictFile(deal.dealCode);
  if (existing.shipmentCheck) return; // sudah pernah dicek — off-chain, sekali cukup

  const check = await checkShipment(deal, shipmentImages(deal), provider);
  writeVerdict(deal.dealCode, { ...existing, shipmentCheck: check });
  const flag = check.itemVisible ? "barang terlihat" : "⚠️ barang TIDAK terlihat di foto packing";
  console.log(`   📦 ${deal.dealCode}: cek pengiriman — ${flag}${check.warnings.length ? " — " + check.warnings.join("; ") : ""}`);
}

/** Kirim resolve()/escalate() on-chain, lalu tulis txHash ke verdict file + audit log. */
async function submitVerdict(deal: DealRecord, verdictHash: Hex, outcome: JudgeOutcome, commit: JudgeCommit): Promise<void> {
  const dealId = deal.dealId as Hex;
  const receipt = outcome === "ESCALATE" ? await escalate(dealId, verdictHash) : await resolve(dealId, outcome === "REFUND", verdictHash);
  const txHash = receipt.transactionHash;

  writeVerdict(deal.dealCode, { ...readVerdictFile(deal.dealCode), txHash });
  appendAuditLog({ ts: new Date().toISOString(), dealCode: deal.dealCode, dealId, outcome, verdictHash, txHash, commit });

  const icon = outcome === "REFUND" ? "💸" : outcome === "RELEASE" ? "✅" : "🙋";
  console.log(`   ${icon} ${deal.dealCode}: ${outcome}${outcome !== "ESCALATE" ? ` (${commit.confidence.toFixed(2)})` : ""} — ${commit.reasons.join("; ")}`);
  console.log(`      tx ${txHash.slice(0, 14)}... verdictHash ${verdictHash.slice(0, 14)}...`);
}

async function maybeJudge(
  deal: DealRecord,
  onchain: OnchainDeal,
  provider: AiProvider | null,
  registry: PhotoRegistry,
): Promise<void> {
  const existing = readVerdictFile(deal.dealCode);

  if (existing.verdictHash && existing.txHash) return; // sudah selesai sepenuhnya

  if (existing.verdictHash && existing.commit) {
    // Proses sebelumnya crash SETELAH verdict ditulis tapi SEBELUM tx terkirim — kirim ulang
    // tx dengan verdictHash yang SAMA (jangan panggil AI lagi, supaya hash tidak berubah-ubah
    // di antara percobaan; itu yang membuatnya bisa dicocokkan publik ke event on-chain).
    await submitVerdict(deal, existing.verdictHash, existing.commit.outcome, existing.commit);
    return;
  }

  const responded = !!deal.sellerResponse;
  const windowElapsed = Math.floor(Date.now() / 1000) >= onchain.disputedAt + config.sellerResponseSeconds;
  if (!responded && !windowElapsed) return; // masih menunggu tanggapan penjual

  const verdict = await judgeDispute(deal, judgeImages(deal), {
    provider,
    confidenceThreshold: config.confidenceThreshold,
    registry,
    buyerPhotoFilenames: deal.dispute?.photos ?? [],
  });

  writeVerdict(deal.dealCode, { ...existing, commit: verdict.commit, verdictHash: verdict.verdictHash, raw: verdict.raw });
  await submitVerdict(deal, verdict.verdictHash, verdict.outcome, verdict.commit);
}

async function processDeal(deal: DealRecord, provider: AiProvider | null, registry: PhotoRegistry): Promise<void> {
  const onchain = await getDeal(deal.dealId as Hex);
  if (onchain.status === Status.Shipped) {
    await maybeCheckShipment(deal, provider);
  } else if (onchain.status === Status.Disputed) {
    await maybeJudge(deal, onchain, provider, registry);
  }
  // Funded / Escalated / status final: tidak ada aksi agent di tick ini.
}

/** 3x error API berturut-turut untuk deal yang sama -> lempar paksa ke arbiter manusia,
 * tanpa perlu panggilan AI lagi (kita sudah tahu AI-nya tidak bisa dihubungi). */
async function forceEscalate(deal: DealRecord, provider: AiProvider | null, attempts: number): Promise<void> {
  const modelName = provider?.name ?? "mock";
  const verdict = buildEscalateVerdict(deal, modelName, [
    `Verifikasi AI gagal ${attempts}x berturut-turut (error jaringan/API) — dilempar ke arbiter manusia`,
  ]);
  writeVerdict(deal.dealCode, { ...readVerdictFile(deal.dealCode), commit: verdict.commit, verdictHash: verdict.verdictHash, raw: verdict.raw });
  await submitVerdict(deal, verdict.verdictHash, "ESCALATE", verdict.commit);
}

export async function runDaemon(): Promise<void> {
  console.log(`\n⚖️  Rekber AI arbiter mulai jalan.\n   Wallet AI arbiter: ${account.address}`);
  const provider = createAiProvider(config);
  console.log(`   Provider: ${provider?.name ?? "mock"} (ambang confidence ${config.confidenceThreshold})`);
  console.log(`   Polling tiap ${config.pollMs / 1000}s dari ${config.dataDir}\n`);

  const registry = new PhotoRegistry(path.join(config.dataDir, "photo-registry.json"));
  const apiRetries = new Map<string, number>();

  for (;;) {
    await sleep(config.pollMs);
    const deals = listDeals().filter((d) => !!d.txs.fund); // hanya deal yang sudah didanai on-chain

    for (const deal of deals) {
      try {
        await processDeal(deal, provider, registry);
        apiRetries.delete(deal.dealCode);
      } catch (err) {
        const attempts = (apiRetries.get(deal.dealCode) ?? 0) + 1;
        apiRetries.set(deal.dealCode, attempts);
        console.log(`   ⚠️ ${deal.dealCode}: error (${(err as Error).message}) — percobaan ${attempts}/${MAX_API_RETRIES}`);
        if (attempts >= MAX_API_RETRIES) {
          apiRetries.delete(deal.dealCode);
          await forceEscalate(deal, provider, attempts).catch((err2) => {
            console.log(
              `   ⛔ ${deal.dealCode}: gagal escalate paksa juga (${(err2 as Error).message}) — dibiarkan Disputed (splitStale jadi jaring pengaman terakhir)`,
            );
          });
        }
      }
    }
  }
}
