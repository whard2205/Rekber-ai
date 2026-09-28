# Saran Perbaikan MANDOR — versi **Opus 5.5**

> **Reviewer:** Claude Opus 5.5 · **Tanggal review:** 28 Sep 2026
> **Untuk:** dibandingkan dengan saran **Astra 6** (taruh di `docs/review/SARAN-ASTRA-6.md`), lalu dieksekusi **Sonnet 5**
> **Track:** AI Agents — *"autonomous agents & AI x DeFi onchain"* · Indonesia Web3 Hackathon 2026 (Binance Academy × BNB Chain × Coinvestasi)
> **Aturan event yang terverifikasi dari website:** wajib *Built on BNB Chain*; submission **1–30 Sep 2026**; wajib daftar via Luma; hadiah Grand $1.000, podium per track $600/$400/$300, Community Choice $100.
> Kriteria penilaian dan isi form submission **tidak tercantum** di website → cek langsung di Luma/portal submission.

Setiap saran punya ID `O-xx` (O = Opus) supaya gampang dicocokkan dengan ID dari Astra 6 di tabel §6.

---

## 0. TL;DR

**Deadline submit tinggal ~2 hari (30 Sep).** Commit terakhir 14 Jul, dan sejak itu belum ada commit lagi.

Kodenya **bagus dan jujur**: state machine escrow rapi, `forceRelease` melindungi worker, kode tantangan dibuat agent (bukan model), output model divalidasi schema + confidence gate, trust model ditulis terbuka. Secara fitur, MVP-nya **cukup untuk lolos ke Demo Day**.

Tapi dalam kondisi sekarang, **proyek ini belum siap dinilai**. Ada 4 blocker:

1. **`node_modules` hasil install di Windows** (ada `@esbuild/win32-x64`, `@next/swc-win32-x64-msvc`, dan hardhat native module gagal load). Di Mac ini `npm test`, `npm start`, dan `next dev` semuanya gagal.
2. **Belum di-deploy ke BSC testnet.** Yang ada hanya `deployments/localhost.json`. Padahal syarat utamanya *"Built on BNB Chain"*.
3. **Otak agent masih MOCK.** `agent/.env` isinya `MANDOR_MOCK_BRAIN=1` dan tidak ada `ANTHROPIC_API_KEY`, jadi task yang muncul di demo berjudul `[MOCK] Foto jempol`. Untuk track AI Agents, ini fatal.
4. **Belum ada repo publik** (tidak ada `git remote`), juga belum ada video demo.

Urutan kerjanya: **bereskan P0 → deploy testnet → rekam video → submit paling lambat 30 Sep pagi.** P1/P2 dikerjakan setelah submit, untuk persiapan Demo Day 31 Okt.

---

## 1. Cek MVP — "cukup untuk dipanggil Demo Day?"

| # | Yang biasanya dicek juri AI-agent track | Status sekarang | Bukti |
|---|---|---|---|
| 1 | Jalan di BNB Chain (testnet/mainnet) | ❌ Belum | hanya `contracts/deployments/localhost.json` |
| 2 | Kontrak terverifikasi di explorer | ❌ Belum | — |
| 3 | Agent benar-benar pakai AI (bukan mock) | ❌ Mock | `agent/.env`: `MANDOR_MOCK_BRAIN=1`, tanpa `ANTHROPIC_API_KEY` |
| 4 | Agent otonom: plan → aksi on-chain → verifikasi → bayar | ✅ Ada | `agent/src/loop.ts` |
| 5 | Keputusan AI bisa diaudit | 🟡 Off-chain saja | `missions/audit-log.jsonl`; belum ada komitmen on-chain (lihat O-09) |
| 6 | UX untuk orang non-crypto | ✅ Bagus | burner wallet + relayer gasless + UI Bahasa Indonesia |
| 7 | Layar demo panggung | ✅ Ada | `worker-app/src/app/panggung/page.tsx` |
| 8 | Test suite | 🟡 Ada, tapi tidak bisa jalan di Mac ini | 36 `it(` di kontrak (README bilang 28), 15 di agent; typecheck agent & worker-app **lulus** |
| 9 | Repo publik + README jelas | 🟡 README bagus, repo belum publik | `git remote -v` kosong |
| 10 | Video demo | ❌ Belum ada | — |
| 11 | Tahan banting saat live demo di testnet | ❌ Beberapa titik bisa crash | O-04, O-05, O-07, O-08, O-10, O-12 |

**Kesimpulan:** fitur inti sudah ada, dan kalau P0 di §3 beres, peluang lolos seleksi realistis. Yang bikin gugur biasanya justru hal non-fitur: tidak ada deployment di BNB, demo pakai mock, dan tidak ada video.

---

## 2. Yang SUDAH bagus — jangan "disederhanakan" oleh eksekutor

- Aturan dana di `TaskEscrow`: setelah proof masuk, agent cuma bisa *bayar* atau *reopen*. `forceRelease` melindungi worker kalau agent diam.
- Kode tantangan dibuat oleh `generateChallenge()` di `loop.ts`, bukan oleh model, lalu ikut di-hash ke `specHash` on-chain.
- `parseModelVerdict` + confidence gate + batas jumlah verifikasi. Output model **tidak pernah** langsung dipakai untuk aksi finansial.
- Abstraksi `ModelVerifier` (anthropic / openai / aimlapi / mock) dengan gate yang sama untuk semua provider.
- Bagian "What it is NOT" dan tabel Trust model di README. Kejujuran ini jadi nilai plus di mata juri, jadi pertahankan.
- Relayer gasless (`claimFor`/`submitProofFor`) + burner wallet, sehingga penonton bisa jadi worker dalam 30 detik.

---

## 3. Temuan & saran

Format tiap item: **Masalah → Bukti → Fix → Cek selesai.** Effort: S (<1 jam), M (1–3 jam), L (setengah hari atau lebih).

### P0 — wajib sebelum submit (28–30 Sep)

#### O-01 · Reinstall dependency (node_modules dari Windows) · S
- **Masalah:** esbuild, Next SWC, dan native module hardhat semuanya binary Windows. Akibatnya `tsx`, `hardhat test`, dan `next dev/build` gagal di macOS arm64.
- **Bukti:** `agent`: *"@esbuild/win32-x64 package is present but this platform needs @esbuild/darwin-arm64"*; `worker-app/node_modules/@next/swc-win32-x64-msvc`; `contracts`: `ERR_DLOPEN_FAILED` di `@nomicfoundation/solidity-analyzer`. `node_modules/.bin/*` juga tidak executable.
- **Fix:** `rm -rf node_modules && npm ci` di ketiga workspace (hapus juga `worker-app/.next`).
- **Cek selesai:** `npm test` di contracts & agent hijau, `npm run build` di worker-app sukses. Update angka test di README kalau memang 36, bukan 28.

#### O-02 · Otak agent masih MOCK → pakai AI sungguhan · S (opsi A) / M (opsi B)
- **Masalah:** dengan `MANDOR_MOCK_BRAIN=1`, `planTasks()` mengembalikan task `[MOCK] Foto jempol`. Verifier sudah pakai aimlapi, tapi planner hanya bisa lewat Anthropic SDK, dan `config.ts` men-throw error kalau non-mock tanpa `ANTHROPIC_API_KEY`.
- **Bukti:** `agent/.env` (`MANDOR_MOCK_BRAIN=1`, `VERIFIER_PROVIDER=aimlapi`); `agent/src/config.ts:59`; `agent/src/brain.ts` `planTasks`.
- **Fix — pilih satu (keputusan kamu):**
  - **A (disarankan, nol kode):** isi `ANTHROPIC_API_KEY`, set `MANDOR_MOCK_BRAIN=0`. Planner sudah memakai structured output (`output_config.format` + json_schema) dan adaptive thinking. Verifier boleh tetap aimlapi atau pindah ke `anthropic`.
  - **B (kalau cuma punya kredit aimlapi):** tambahkan `PLANNER_PROVIDER=aimlapi` di `config.ts`, lalu di `brain.ts` buat jalur `fetch` ke `https://api.aimlapi.com/v1/chat/completions` dengan `response_format: json_schema` memakai `PLAN_SCHEMA` yang sudah ada. Pola kodenya tiru persis `OpenAICompatibleVerifier` di `verifier.ts`. Ubah juga guard di `config.ts:59` supaya hanya mewajibkan `ANTHROPIC_API_KEY` saat planner = anthropic.
- **Cek selesai:** `npm start -- "Saya butuh 2 foto jempol dari pengunjung venue"` menghasilkan judul/instruksi task yang ditulis model, dan tidak ada string `[MOCK]` di log maupun di UI.

#### O-03 · Deploy ke BSC testnet + verify di BscScan · M
- **Masalah:** belum ada deployment di BNB Chain.
- **Fix:**
  1. Siapkan **3 wallet terpisah: deployer, agent, relayer.** Agent dan relayer **tidak boleh** memakai kunci yang sama, karena dua proses yang mengirim tx dari alamat yang sama akan bentrok nonce di testnet (di hardhat lokal tidak kelihatan karena automine).
  2. Isi tBNB dari faucet ke wallet agent dan relayer.
  3. Buat `contracts/.env` (sudah di-gitignore) berisi `DEPLOYER_PRIVATE_KEY`, `BSC_TESTNET_RPC_URL`, `AGENT_ADDRESS`, `RELAYER_ADDRESS`, `ETHERSCAN_API_KEY`.
  4. Jalankan deploy, verify, dan `export-abi`. `deployments/bscTestnet.json` **di-commit** (yang di-ignore hanya localhost).
  5. Set `CHAIN_ID=97`, `RPC_URL`, `ESCROW_ADDRESS`, dan `TOKEN_ADDRESS` di `agent/.env` & `worker-app/.env`. Di worker-app juga set `NEXT_PUBLIC_EXPLORER_URL=https://testnet.bscscan.com`.
- **Keputusan urutan:** kalau waktunya mepet, **deploy kontrak yang sekarang dulu** lalu submit. Perubahan kontrak di P1 (O-09/O-10/O-11) digabung jadi satu redeploy untuk Demo Day. Redeploy di testnet itu murah; yang mahal itu telat submit.
- **Cek selesai:** kontrak berstatus verified di testnet.bscscan.com, dan satu misi penuh (post → claim → submit → release) punya 4 link tx yang bisa diklik.

#### O-04 · Agent loop crash kalau RPC testnet tersendat · S
- **Masalah:** `getTask`, `releaseBounty`, dan `rejectAndReopen` di dalam loop polling tidak dibungkus try/catch. Satu error RPC saja sudah cukup untuk mematikan proses misi. Kalau di-restart, agent akan **merencanakan ulang dan mengunci escrow baru**, sementara task lama terlantar.
- **Bukti:** `agent/src/loop.ts:94`, `:149`, `:156`.
- **Fix:** bungkus isi `for (const t of tracked)` per task dengan try/catch, lalu log error dan `continue`. Kalau tx release/reject gagal, set `t.lastTriedProof = null` supaya dicoba lagi di tick berikutnya.
- **Cek selesai:** matikan RPC sebentar (atau lempar error buatan sekali). Loop harus tetap hidup dan akhirnya membayar.

#### O-05 · Upload foto: retry kena 409 palsu + ukuran foto HP · S
- **Masalah 1:** file disimpan ke `uploads/` **sebelum** tx `submitProofFor`. Kalau tx gagal, worker yang mencoba lagi dengan foto yang sama malah ditolak dengan pesan *"Foto ini sudah pernah dipakai"*.
- **Bukti 1:** `worker-app/src/app/api/tasks/[id]/submit/route.ts:65`.
- **Fix 1:** di `catch`, hapus file tersebut (`unlink`) sebelum return error.
- **Masalah 2:** foto HP bisa 5–8 MB. Batas Claude API adalah **10 MB dalam bentuk base64** (≈7,5 MB biner), sedangkan batas di kode 8 MB biner (`agent/src/verifier.ts:19`). Foto 7,5–8 MB lolos upload tapi ditolak API. Loop lalu retry 3× dan akhirnya menyerah, sehingga task macet di status Submitted sampai `forceRelease` 24 jam kemudian. Selain itu, upload 5 MB × banyak penonton lewat WiFi venue akan lambat.
- **Fix 2:** resize di browser sebelum upload (native `<canvas>`, tanpa dependency) di `handleFile` (`worker-app/src/app/task/[id]/page.tsx:103`): sisi terpanjang maksimal 2000 px, `toBlob('image/jpeg', 0.85)`. Kode tantangan di foto tetap terbaca. Turunkan juga `MAX_UPLOAD_MB` default ke 6.
- **Cek selesai:** foto 12 MP dari HP terkirim dalam bentuk file < 1,5 MB, dan submit ulang setelah tx gagal tidak kena 409.

#### O-06 · Paket submission · M
- Buat **repo GitHub publik**, lalu push. Sebelum push, jalankan scan rahasia: `git log -p --all | grep -nE 'sk-|AIMLAPI|PRIVATE_KEY=0x'`. `.env` memang tidak pernah ter-track, tapi tetap cek. Kunci hardhat #0 di `fake-worker.ts` aman karena memang kunci publik untuk chain lokal.
- **README paling atas:** tambahkan bagian *"Live on BSC Testnet"* berisi alamat kontrak (link BscScan), satu tx contoh untuk setiap state (post, claim, submit, release, reject/reopen), dan link video.
- **Video demo 2–3 menit:** ketik goal → task muncul → scan QR di HP → foto dengan kode → layar panggung menampilkan verdict AI → payout dengan link BscScan. Tunjukkan juga **satu REJECT** (foto tanpa kode). Ini bukti anti-cheat bekerja, jadi jangan dilewatkan.
- **Deck:** narasi sudah ada di `BLUEPRINT.md` §7, tinggal dipindahkan ke slide.
- Isi form di Luma/portal **paling lambat 30 Sep pagi**, dan cek jam cutoff-nya (zona waktu). Buat tag `v-submission` di commit yang di-submit.

### P1 — sebelum submit kalau sempat; paling lambat sebelum Demo Day

> O-09, O-10, dan O-11 mengubah kontrak. **Kerjakan ketiganya sekaligus, lalu redeploy satu kali.**

#### O-07 · `/riwayat` akan kosong/error di testnet · S
- **Masalah:** `getPayoutsFor` memanggil `eth_getLogs` dengan `fromBlock: 0n`. Public RPC BSC testnet membatasi range `getLogs`, dan sebulan setelah deploy range-nya sudah jutaan blok.
- **Bukti:** `worker-app/src/lib/chain.ts:121`.
- **Fix:** susun riwayat dari `audit-log.jsonl` (entri `APPROVE` untuk `worker` tersebut sudah memuat `taskId` dan `txHash`), lalu ambil `getTask(taskId).bounty` untuk nominalnya. Cara ini tidak butuh query log sama sekali.
- **Cek selesai:** `/riwayat` di testnet menampilkan payout yang benar.

#### O-08 · Relayer bentrok nonce saat banyak penonton klik bersamaan · S
- **Masalah:** tiap request claim/submit mengirim tx dari relayer secara paralel. Di testnet, beberapa request bisa mendapat nonce yang sama, sehingga muncul error *nonce too low / replacement underpriced* tepat ketika 5 orang tap "Ambil Kerjaan" berbarengan.
- **Bukti:** `worker-app/src/lib/chain.ts:46`.
- **Fix:** `privateKeyToAccount(config.relayerPrivateKey, { nonceManager })` dengan `nonceManager` diimpor dari `viem/accounts`. Sudah dicek ada di viem 2.55.1 yang terpasang. Terapkan hal yang sama di `agent/src/chain.ts`. Kalau masih bentrok, serialkan `write()` memakai promise-chain mutex (±5 baris).
- **Cek selesai:** 3 claim dengan `curl &` paralel ke 3 task di testnet semuanya sukses.

#### O-09 · Komitmen verdict AI on-chain (paling "AI × onchain") · M
- **Masalah:** juri yang jeli akan bertanya: *"agent bisa reject kerja yang jujur, lalu `refundExpired` setelah deadline. Apa bedanya dengan narik dana?"* Saat ini alasan reject hanya tersimpan di file lokal.
- **Fix:** tambah parameter `bytes32 verdictHash` ke `releaseBounty` dan `rejectAndReopen`, lalu ikutkan di event `BountyReleased` / `TaskReopened`. Agent menghitung `keccak256` dari JSON verdict (decision, reasons, confidence, evidenceHash, verifier) dan menyimpan JSON yang sama di audit log. Siapa pun bisa mencocokkan log ↔ hash on-chain. Tampilkan badge "verdict ter-commit on-chain ↗" di `/panggung`.
- **Bukti:** `contracts/contracts/TaskEscrow.sol:58-59`, `:135`.
- **Pitch:** *"Setiap keputusan AI, termasuk penolakan, dikomit publik di BNB Chain sebelum dana bergerak."* README juga perlu diperbarui: klaim "agent can never withdraw" diberi catatan jujur soal reject→refund, ditambah mitigasi di atas. Dispute/arbitrase ditulis sebagai future work.
- **Cek selesai:** test kontrak baru untuk event beserta hash-nya, dan satu tx reject di BscScan yang event-nya memuat `verdictHash`.

#### O-10 · Claim kedaluwarsa (anti "claim semua lalu kabur") · M
- **Masalah:** siapa pun bisa claim semua task Open lewat API (burner wallet gratis), dan task tertahan status Claimed sampai deadline (default 60 menit). Satu penonton iseng saja sudah cukup untuk membekukan demo.
- **Fix:** tambah `uint40 claimedAt` dan `immutable claimWindow` (misal 10 menit). Di `_claim`, izinkan klaim kalau status `Open` **atau** (`Claimed` && `now > claimedAt + claimWindow`). Route `claim/route.ts` juga perlu mengizinkan klaim ulang untuk Claimed yang sudah basi.
- **Bukti:** `TaskEscrow.sol:166`; `worker-app/src/app/api/tasks/[id]/claim/route.ts`.
- **Cek selesai:** test *"claim basi bisa diambil alih; claim segar tidak bisa"*.

#### O-11 · `_submit` belum cek deadline · S
- **Masalah:** pengecekan submit terlambat baru ada off-chain (lapis 4 di verifier). Di kontrak, submit setelah deadline masih diterima.
- **Fix:** tambah `if (block.timestamp > t.deadline) revert DeadlinePassed();` di `_submit` (`TaskEscrow.sol:176`), plus 1 test.

#### O-12 · Ambil `taskId` dari receipt, bukan query log terpisah · S
- **Masalah:** `postTask` memanggil `getContractEvents` untuk blok receipt. Public RPC yang di-load-balance bisa tertinggal satu node, sehingga muncul error *"TaskPosted event tidak ditemukan"* dan misi gagal di awal.
- **Bukti:** `agent/src/chain.ts:97`.
- **Fix:** `parseEventLogs({ abi: escrowAbi, logs: receipt.logs, eventName: "TaskPosted" })` (sudah ada di viem terpasang). Kodenya lebih pendek dan tidak butuh panggilan RPC tambahan.

#### O-13 · Latensi verifikasi di panggung · S
- **Masalah:** verifier memakai adaptive thinking (`agent/src/verifier.ts:148`). Di atas panggung, 20 detik terasa sangat lama.
- **Fix:** ukur dulu. Kalau lebih dari ~10 detik, tambahkan `output_config: { effort: "low" }` hanya di panggilan verifier (planner tetap). Pilihan model verifier (`VERIFIER_MODEL`) adalah keputusan kamu soal biaya dan kecepatan.
- **Cek selesai:** waktu dari submit sampai verdict tercatat, dan targetnya di bawah 10 detik.

#### O-14 · Konsistensi dokumen · S
- README menyebut 28 test kontrak, padahal ada 36 `it(`.
- `BLUEPRINT.md:117` masih "deploy Base Sepolia".
- BLUEPRINT §4 menyebut EXIF check, redundansi multi-worker, reputation, dan IPFS/Pinata **seolah sudah ada**, padahal belum diimplementasi. Juri yang membaca bisa menangkap ketidaksesuaian ini. Tandai sebagai *Roadmap*, atau pindahkan BLUEPRINT ke `docs/`.
- Kalimat pitch *"IDRX mendarat di wallet"* perlu diganti menjadi *"Mock IDRX di BSC testnet (2 desimal, sama seperti IDRX)"* supaya jujur.

### P2 — pembeda juara untuk Demo Day (1–30 Okt)

| ID | Ide | Kenapa menaikkan skor | Effort |
|---|---|---|---|
| O-15 | **Pintu masuk agent-to-agent**: MCP server/HTTP endpoint `hire_human(goal, budget)`, sehingga agent lain (misal Claude Desktop) bisa menyewa manusia lewat MANDOR. Loop membaca goal dari antrean, bukan dari `argv`. | Mengubah demo CLI menjadi *infrastruktur agent economy*, persis narasi x402/AP2 di BLUEPRINT | L |
| O-16 | **Identitas ERC-8004** agent MANDOR di BSC: satu tx registrasi + link di README (jalurnya sudah ditulis di README). **Verifikasi dulu alamat registry di BSC testnet.** | Sinyal "BNB-native agent" langsung ke juri BNB Chain | M |
| O-17 | Input goal langsung dari `/panggung` (tidak lewat terminal) | Demo lebih mulus, cocok dipasangkan dengan O-15 | M |
| O-18 | Agent menaikkan bounty kalau task tidak diambil dalam N menit (butuh `topUpBounty` di kontrak) | Memperlihatkan penalaran ekonomi agent secara nyata | M |
| O-19 | Saat start, agent memindai task miliknya yang lewat deadline lalu memanggil `refundExpired` | Tidak ada dana terlantar setelah crash/restart | S |
| O-20 | Hosting untuk juri: agent dan worker-app **harus satu mesin** (keduanya berbagi `missions/` & `uploads/`); ekspos dengan `cloudflared tunnel --url http://localhost:3001`. Kalau pakai VPS, buat proyek/compose terpisah dan **jangan sentuh container PAIO/sales**. | Juri bisa mencoba sendiri | M |
| O-21 | Kode tantangan baru ditampilkan setelah claim (sekarang `/api/tasks/:id` membukanya ke semua orang) | Mempersempit jendela curang; prioritas rendah | S |

---

## 4. Playbook eksekusi untuk **Sonnet 5**

**Aturan main untuk eksekutor:**
- Buat branch baru dari HEAD: `git checkout -b feat/submission-ready`. Buat **satu commit per ID** (`fix(O-04): ...`).
- **Jangan pernah** mencetak, meng-commit, atau menempel isi `.env` / private key ke chat atau log. Kunci testnet diisi sendiri oleh user.
- **Jangan** push, membuat repo publik, atau deploy ke testnet tanpa konfirmasi user di langkah itu.
- Pertahankan semua poin di §2. Jangan hapus confidence gate, `parseModelVerdict`, `forceRelease`, atau label `[MOCK]`.
- Setelah setiap ID: jalankan test yang relevan. Kalau merah, perbaiki dulu sebelum lanjut.

**Urutan:**

```bash
# ── Hari 1 (28 Sep) ─────────────────────────────────────────────
# O-01: reinstall dependency untuk macOS
cd contracts   && rm -rf node_modules && npm ci && npx hardhat test
cd ../agent    && rm -rf node_modules && npm ci && npm test && npm run typecheck
cd ../worker-app && rm -rf node_modules .next && npm ci && npm run typecheck && npm run build

# E2E lokal (acuan sebelum mengubah apa pun) — ikuti README "Running locally" + smoke test
#   terminal 1: cd contracts && npm run node
#   terminal 2: cd contracts && npm run deploy:localhost && npm run export-abi
#   terminal 3: cd agent && MANDOR_MOCK_BRAIN=1 VERIFIER_PROVIDER=mock npm start -- "Saya butuh 2 foto jempol"
#   terminal 4: cd worker-app && npm run dev
#   terminal 5: cd worker-app && node scripts/smoke-test.mjs      # harus 5/5 lulus

# O-02 (tanya user: opsi A atau B) → O-04 → O-05 → ulangi smoke test lokal

# ── Hari 2 (29 Sep) ─────────────────────────────────────────────
# O-03: deploy BSC testnet (user sudah mengisi contracts/.env & mendanai wallet)
cd contracts
npx hardhat run scripts/deploy.js --network bscTestnet
npx hardhat verify --network bscTestnet <ESCROW> <RELAYER_ADDRESS> 86400
npx hardhat verify --network bscTestnet <IDRX>
npm run export-abi                      # menyalin ABI ke agent/src/abi & worker-app/src/abi
# isi CHAIN_ID=97, RPC_URL, ESCROW_ADDRESS, TOKEN_ADDRESS di agent/.env & worker-app/.env
# e2e testnet dengan 2 HP sungguhan: 1 APPROVE + 1 REJECT (foto tanpa kode)

# O-06: README "Live on BSC Testnet" + rekam video + (dengan izin user) push repo publik

# ── 30 Sep pagi ─────────────────────────────────────────────────
git tag v-submission                    # lalu isi form submission
# ── Setelah submit ─────────────────────────────────────────────
# P1: O-07, O-08, O-12, O-13, O-14, lalu batch kontrak O-09+O-10+O-11 → redeploy → update README
# P2: sesuai waktu, urutan disarankan O-15 → O-16 → O-19 → O-20
```

**Definition of Done untuk submission:** repo publik · kontrak verified di BscScan · README berisi link tx nyata · video menunjukkan AI sungguhan (tanpa `[MOCK]`), satu APPROVE dan satu REJECT · semua test hijau di mesin demo.

---

## 5. Sengaja TIDAK disarankan (jebakan scope)

- Pindah ke mainnet / IDRX asli sebelum submit. Risiko dan biayanya tidak sebanding. Testnet + Mock IDRX yang dijelaskan dengan jujur sudah cukup.
- Multi-chain, token sendiri, DAO, atau aplikasi mobile native (BLUEPRINT sendiri sudah melarang).
- Integrasi IPFS/Pinata sebelum submit. Proof store lokal + hash on-chain sudah cukup untuk MVP; IPFS masuk roadmap.
- Menulis ulang agent memakai framework agent. Loop sekarang sudah pendek, jelas, dan bisa diaudit, dan itu justru nilai jual.

---

## 6. Template perbandingan dengan Astra 6

Isi kolom Astra 6 dengan ID/ringkasan dari `SARAN-ASTRA-6.md`, lalu tentukan keputusan final sebelum menyerahkan ke Sonnet 5.

| ID Opus | Topik | Prioritas Opus | Astra 6 bilang | Sama/Beda | Keputusan final |
|---|---|---|---|---|---|
| O-01 | Reinstall node_modules (Windows→Mac) | P0 | | | |
| O-02 | Planner masih MOCK | P0 | | | |
| O-03 | Deploy + verify BSC testnet, 3 wallet terpisah | P0 | | | |
| O-04 | Agent loop crash karena RPC | P0 | | | |
| O-05 | Upload: 409 palsu + resize foto | P0 | | | |
| O-06 | Repo publik, README live, video, deck | P0 | | | |
| O-07 | `/riwayat` getLogs dari blok 0 | P1 | | | |
| O-08 | Nonce relayer paralel | P1 | | | |
| O-09 | verdictHash on-chain | P1 | | | |
| O-10 | Claim kedaluwarsa | P1 | | | |
| O-11 | Deadline di `_submit` | P1 | | | |
| O-12 | `parseEventLogs` dari receipt | P1 | | | |
| O-13 | Latensi verifier | P1 | | | |
| O-14 | Konsistensi dokumen | P1 | | | |
| O-15…21 | Pembeda Demo Day | P2 | | | |
| — | *(temuan Astra 6 yang tidak ada di sini)* | | | | |

---

## 7. Batasan review ini

- **Test belum bisa aku jalankan** karena masalah node_modules Windows (O-01). Klaim "28/15 test lulus" di README belum terverifikasi olehku. Yang sudah terverifikasi: `tsc --noEmit` untuk agent dan worker-app **lulus**.
- Belum dites di BSC testnet sungguhan. Semua temuan testnet (O-04, O-07, O-08, O-12) berasal dari membaca kode dan perilaku umum public RPC.
- Kriteria penilaian dan isi form submission tidak ada di website, jadi cek sendiri di Luma/portal.
- Alamat registry ERC-8004 di BSC testnet belum aku verifikasi (O-16).
- Batas ukuran gambar di aimlapi belum aku cek. Angka 10 MB base64 adalah batas Claude API langsung (dokumentasi resmi Vision).
