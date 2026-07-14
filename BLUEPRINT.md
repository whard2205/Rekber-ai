# MANDOR — Human Execution & Proof Layer untuk AI Agent

> **Track:** AI Agents · **Event:** Indonesia Web3 Hackathon 2026 (didukung BNB Chain)
> **Positioning:** MANDOR adalah *BNB-native human execution and proof layer* — akses AI agent ke dunia fisik. Agent secara otonom membuat task, mengunci upah IDRX di escrow, menerima pekerja manusia, memverifikasi bukti anti-manipulasi berlapis, dan menyelesaikan pembayaran on-chain.
> **Catatan jujur:** produk "AI menyewa manusia" sudah ada (RentAHuman dkk). Kita TIDAK mengklaim jadi yang pertama — diferensiasi kita di lapisan eksekusi + bukti: challenge-bound proof, verifikasi berlapis, perlindungan worker di kontrak, settlement IDRX, Indonesia-first.

---

## 1. Kenapa Ide Ini (Bukan yang Lain)

**Masalah #1 — yang SUDAH terjadi hari ini:** Jutaan manusia sudah bekerja untuk AI (data labeling, RLHF, verifikasi). Tapi rails pembayarannya rusak. Investigasi Washington Post (2023) pada Remotasks (milik Scale AI): dari 36 pekerja Filipina yang diwawancara, **34 mengalami upah ditunda, dipotong, atau dibatalkan** setelah pekerjaan selesai. Seorang pekerja dibayar **$0,30 untuk 4 jam kerja**. Tidak ada jalur banding; yang protes malah akunnya dinonaktifkan. Inspektur ketenagakerjaan lokal tak bisa berbuat apa-apa karena perusahaannya di luar negeri.

**Masalah #2 — yang akan meledak:** AI agent makin otonom, tapi **buta dan lumpuh di dunia fisik**. Agent tidak bisa cek harga di warung, foto kondisi lokasi, atau konfirmasi toko itu beneran buka. Dunia nyata belum punya API — manusialah API-nya.

**MANDOR menjawab keduanya:** marketplace tempat AI agent merekrut manusia untuk tugas dunia nyata, dengan **escrow on-chain** (upah terkunci SEBELUM kerja dimulai — mustahil ditahan seperti kasus Remotasks), **verifikasi otomatis** (vision AI, kriteria transparan), dan **gaji instan** (detik, bukan minggu).

**Framing pitch:** Banyak tim akan pitching "agent yang melayani manusia di DeFi". MANDOR ada di segmen kebalikan: **manusia yang mengeksekusi untuk AI — dengan bukti yang bisa diverifikasi dan perlindungan pembayaran di level kontrak.** Bukan klaim "pertama di dunia" (RentAHuman dkk sudah ada) — klaimnya: *execution + proof layer* yang paling bisa dipercaya, BNB-native, dan Indonesia-first.

**Kenapa harus blockchain (jawaban wajib juri):**
1. AI agent tidak bisa buka rekening bank — tapi bisa punya wallet.
2. Micropayment Rp5.000 ke orang asing, lintas negara, instan, tanpa saling percaya = mustahil di rails perbankan (minimum transfer, T+1, KYC dua arah).
3. Escrow trustless = jawaban struktural untuk kasus Remotasks: dana terbukti ada sebelum kerja dimulai, rilis otomatis saat terverifikasi, jejak publik di explorer.

**Fit track "AI Agents" sempurna:** agent *bertindak* (posting task + escrow), *mengambil keputusan* (task mana butuh manusia, hasil mana yang valid), dan *berinteraksi mandiri di blockchain* (bayar tanpa intervensi manusia).

---

## 2. Bukti & Data — Amunisi Pitch (semua dengan sumber)

| # | Klaim di pitch | Data | Cara pakai |
|---|---|---|---|
| 1 | "Manusia sudah bekerja untuk AI — dan diperlakukan buruk" | 10.000+ pekerja Remotasks di Filipina; 34/36 pekerja mengalami upah ditunda/dipotong/dibatalkan; $0,30 per 4 jam kerja ([Washington Post](https://www.washingtonpost.com/world/2023/08/28/scale-ai-remotasks-philippines-artificial-intelligence/); [Business & Human Rights Centre](https://www.business-humanrights.org/en/latest-news/philippines-scale-ai-creating-race-to-the-bottom-as-outsourced-workers-face-poor-conditions-in-digital-sweatshops-incl-low-wages-withheld-payments/); [Rappler](https://www.rappler.com/philippines/philippine-labor-inspectors-so-far-unable-monitor-filipinos-foreign-ai-companies/)) | HOOK pembuka — masalah nyata, emosional, terdokumentasi |
| 2 | "Pasar 'manusia bekerja untuk AI' itu raksasa" | Scale AI: revenue $870M (2024) → proyeksi $2B (2026); Meta bayar **$14,3 miliar** untuk 49% saham; pasar data labeling global ~$10M+ miliar ([Forbes](https://www.forbes.com/sites/janakirammsv/2025/06/23/meta-invests-14-billion-in-scale-ai-to-strengthen-model-training/); [Scale AI stats](https://fueler.io/blog/scale-ai-usage-revenue-valuation-growth-statistics)) | Bukti TAM — ini industri belasan miliar dolar, bukan fantasi |
| 3 | "Raksasa dunia sedang bangun rails pembayaran untuk agent" | Coinbase meluncurkan **x402** (standar HTTP 402 untuk pembayaran stablecoin antar-agent); Google meluncurkan **AP2** bersama 60+ organisasi: Mastercard, PayPal, Amex, Coinbase, Revolut ([Google Cloud](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol); [Coinbase](https://www.coinbase.com/developer-platform/discover/launches/google_x402)) | Momentum — kita naik gelombang yang sedang dibangun Google & Coinbase; MANDOR = lapisan TENAGA KERJA di atas rails itu |
| 4 | "Indonesia adalah talent pool terbesarnya" | **86,56 juta pekerja informal** (BPS Feb 2025); **24 juta gig worker** = 18% angkatan kerja (LD UI x Gojek 2023); dari 2 juta ojol di BPJS, hanya 250 ribu terlindungi jaminan sosial ([CNBC Indonesia](https://www.cnbcindonesia.com/news/20250505122542-4-630957/terungkap-86-juta-warga-ri-kerja-jadi-driver-ojol-hingga-pedagang); [The Conversation](https://theconversation.com/dari-ojek-hingga-penerjemah-berapa-banyak-pekerja-ekonomi-gig-di-indonesia-dan-bagaimana-karakteristik-mereka-211056); [Kemnaker](https://majalahsenta.kemnaker.go.id/artikel/pekerja-gig:-pilar-baru-penyerapan-tenaga-kerja-indonesia)) | Angle lokal — puluhan juta orang siap jadi "mata & tangan" AI, dibayar Rupiah (IDRX), instan |
| 5 | "Model 'kerja fisik dibayar crypto' terbukti jalan" | Hivemapper: **165 ribu+ kontributor** memetakan ~1/3 jalan dunia, dibayar token; perusahaan autonomous vehicle bayar **$4 juta/kuartal** untuk datanya; satu kontributor di Nairobi dapat $18.000/tahun ([DePIN Hub](https://depinhub.io/projects/hivemapper); [DL News](https://www.dlnews.com/articles/defi/solana-depin-project-hivemapper-aims-to-beat-google-maps/)) | Precedent — insentif crypto menggerakkan kerja fisik global, DAN ada pembeli enterprise untuk datanya |
| 6 | "Investor besar sudah validasi tesis 'AI membayar manusia'" | Payman AI ($13,8M funding dari **Visa** & **Coinbase Ventures**) khusus untuk AI-to-human payments ([DeepNewz](https://deepnewz.com/ai/paymanai-secures-3m-visa-backing-ai-human-payment-platform); [Payman](https://paymanai.com/)) | Validasi + diferensiasi: Payman = API fintech (rails bank AS, tertutup); MANDOR = on-chain, escrow trustless, verifikasi vision, payout Rupiah |

**Narasi besarnya:** #1 masalah → #2 pasar raksasa → #3 momentum infrastruktur → #4 talent pool Indonesia → #5 precedent terbukti → #6 validasi investor. Enam langkah, semua bersumber. Juri tidak bisa bilang "ini khayalan".

---

## 3. Cara Kerja (Core Loop)

```
User kasih goal ke agent
        │
        ▼
[1] Agent (Claude) memecah goal → mendeteksi sub-task yang butuh manusia
        │
        ▼
[2] Agent memanggil TaskEscrow.postTask(bounty, specHash)
    → upah terkunci di smart contract, task muncul di aplikasi worker
        │
        ▼
[3] Worker (siapa pun, login 30 detik) claim task → kerjakan → submit bukti
    (foto/jawaban → IPFS, hash on-chain)
        │
        ▼
[4] Agent memverifikasi bukti pakai vision (Claude) vs acceptance criteria
        │
   ┌────┴────┐
   ▼         ▼
 VALID    INVALID/RAGU
   │         │
   ▼         ▼
[5] release  reject → task dibuka lagi
 Bounty(...)  untuk worker lain
   │
   ▼
[6] Worker dibayar IDRX/USDC detik itu juga
        │
        ▼
[7] Agent merangkum semua hasil → laporan ke user
```

Satu-satunya manusia di sistem ini adalah **pekerjanya**. Perekrutan, kontrak, QC, dan penggajian: semuanya agent.

---

## 4. Arsitektur & Tech Stack

| Komponen | Pilihan | Alasan |
|---|---|---|
| Chain | **BNB Smart Chain** (BSC Testnet → mainnet saat demo) | Selaras sponsor hackathon; murah & cepat; IDRX tersedia di BNB; ekosistem agent (ERC-8004 registry, bnbagent-sdk). Kontrak tetap portable ke EVM chain lain via env config. |
| Smart contract | **Solidity + Hardhat**, OpenZeppelin | Satu kontrak `TaskEscrow` (~150 baris): `postTask`, `claimTask`, `submitProof`, `releaseBounty`, `rejectAndReopen`, `refundExpired`. Kecil = bisa diaudit sendiri = pede saat demo. |
| Agent brain | **TypeScript + Claude API** (tool use + vision) | Loop: plan → post → poll events → verify → pay → report. |
| Agent wallet | **viem** (upgrade path: Coinbase AgentKit/CDP) | Agent pegang wallet sendiri, tanda tangan tx sendiri. |
| Worker app | **Next.js PWA mobile-first**, burner wallet lokal (v0) → Privy (v1) | Penonton non-crypto bisa jadi worker dalam 30 detik tanpa install apa pun. Krusial untuk live demo. |
| Relayer | Backend worker-app membayar gas untuk claim/submit (`claimFor`/`submitProofFor`) | Worker baru punya 0 gas — friction harus nol. Roadmap: paymaster/AA. |
| Bukti kerja | **IPFS (Pinata)**, hash on-chain | Murah, verifiable. |
| Token upah | **IDRX** (utama) — settlement bounty on-chain dalam Rupiah | Lokal, relevan untuk juri Indonesia. Istilah yang dipakai: "bounty settlement", BUKAN "gaji/crypto salary". |

### Kontrak `TaskEscrow` — state machine minimal

```
OPEN ──claim──► CLAIMED ──submitProof──► SUBMITTED ──release──► PAID
  │                │                          │
  └── expired ─────┴────── refund ◄───────────┘ (reject → reopen ke OPEN)
```

- Multi-worker task (butuh 5 foto) = agent posting 5 task identik. Kontrak tetap simpel.
- Timeout: task kadaluarsa → dana balik ke agent otomatis.

### Anti-curang (jawaban juri #1: "kalau worker ngirim foto ngasal?")
1. **Vision verification** — Claude membandingkan bukti vs acceptance criteria yang agent tulis sendiri saat posting.
2. **EXIF/timestamp check** — foto harus baru, bukan dari Google.
3. **Redundansi** — task penting dikirim ke 2–3 worker, agent cross-check jawaban.
4. **Reputation** (nice-to-have) — worker jujur naik reputasi, diprioritaskan.
5. Dan yang paling dasar: curang = tidak dibayar; escrow tidak pernah rilis tanpa verifikasi.

---

## 5. Scope MVP — Disiplin, Jangan Melebar

**MUST (tanpa ini bukan MANDOR):**
- [ ] Kontrak TaskEscrow + test suite lengkap, deploy Base Sepolia
- [ ] Agent loop end-to-end: goal → post task → verify vision → pay → report
- [ ] Worker PWA: lihat task → claim → upload foto → dibayar
- [ ] Dashboard "mata agent": task, status, reasoning verifikasi, tx hash live — ini yang disorot proyektor saat demo

**NICE (kalau ada waktu, urut prioritas):**
1. Reputation untuk worker
2. Redundansi multi-worker + cross-check
3. **x402 endpoint**: agent LAIN bisa menyewa manusia lewat MANDOR → pitch scale story: *"MANDOR = human-labor API untuk agent economy"* (nyambung langsung ke narasi Google AP2/Coinbase x402)
4. Geolocation proof

**JANGAN dibuat (jebakan scope):** multi-chain, tokenomics sendiri, DAO governance, mobile app native, kategori task lebih dari foto/verifikasi. MVP = satu loop yang sempurna.

---

## 6. Timeline (hari ini 12 Jul → submit 30 Sep → Demo Day 31 Okt)

| Periode | Target |
|---|---|
| Jul minggu 3–4 | TaskEscrow + test lengkap; agent loop skeleton |
| Agu minggu 1–2 | Worker PWA + relayer; **end-to-end pertama di testnet** 🎯 |
| Agu minggu 3–4 | Vision verification, anti-cheat, dashboard demo, polish UX |
| Sep minggu 1–2 | Deploy final, video demo 2 menit, deck, **SUBMIT AWAL (jangan tunggu tanggal 30)** |
| Sep minggu 3–4 | Buffer: perbaiki dari feedback mentor, submit ulang kalau portal mengizinkan |
| Okt 1–14 | Latihan pitch; siapkan skenario live demo + rencana cadangan |
| Okt 31 | Demo Day 🏆 |

---

## 7. Pitch 3 Menit (Demo Day Script)

**[0:00–0:25] Hook — cerita nyata**
> "2023, Washington Post menginvestigasi Remotasks. Charisse, 23 tahun, melabel data untuk AI selama 4 jam. Dibayar 30 sen. Ribuan pekerja lain upahnya ditahan atau hilang begitu saja — dan tidak ada yang bisa mereka lakukan. Jutaan manusia hari ini bekerja UNTUK AI... dengan sistem penggajian abad lalu."

**[0:25–0:55] Solusi**
> "MANDOR: marketplace tempat AI agent mempekerjakan manusia — dengan aturan yang tidak bisa dicurangi. Agent memecah tugas, MENGUNCI upah di escrow on-chain sebelum kerja dimulai, memverifikasi hasil pakai vision, dan menggaji dalam hitungan detik. Tanpa admin. Tanpa invoice. Tanpa upah yang 'hilang'."

**[0:55–2:20] LIVE DEMO — momen yang bikin menang**
1. Ketik goal di layar: *"Saya butuh 5 foto penonton Demo Day mengacungkan jempol."*
2. Agent memecah → posting 5 task → tunjukkan dana masuk escrow (explorer di layar).
3. **"Sekarang — semua orang di ruangan ini bisa jadi karyawan AI. Scan QR ini."**
4. Penonton claim, foto, submit. Agent memverifikasi live (vision reasoning terlihat di dashboard).
5. IDRX mendarat di wallet penonton detik itu. Minta satu orang mengangkat HP-nya: *"Anda baru saja digaji oleh AI. Dalam Rupiah."*

**[2:20–2:50] Why blockchain + market**
> "Gaji Rp5.000, instan, ke orang asing, lintas negara — mustahil di rails bank; dan agent tidak punya rekening bank. Pasarnya sudah terbukti: Meta bayar $14 miliar untuk Scale AI. Google & Coinbase sedang bangun rails pembayaran agent (AP2, x402) bareng Mastercard dan PayPal. Hivemapper membuktikan 165 ribu orang mau kerja fisik dibayar crypto. Dan Indonesia punya 86 juta pekerja informal — talent pool terbesar untuk ekonomi agent."

**[2:50–3:00] Close**
> "Di masa depan, AI tidak menggantikan pekerjaan manusia — AI menciptakannya, dan membayarnya dengan adil. MANDOR adalah tempat AI merekrut. **AI is hiring.**"

**Rencana cadangan demo (wajib punya):** video rekaman end-to-end + testnet fallback + satu HP tim yang sudah siap jadi worker kalau WiFi venue bermasalah.

---

## 8. Jawaban untuk Pertanyaan Juri

| Pertanyaan | Jawaban |
|---|---|
| Worker curang? | Vision check + EXIF + redundansi multi-worker + reputation. Dan escrow berarti curang = tidak dibayar. |
| Kenapa nggak Web2 saja? | Agent tak punya rekening bank; micropayment global instan; escrow tanpa pihak ketiga — justru ketiadaan escrow trustless itulah yang bikin kasus Remotasks terjadi. Hilangkan blockchain-nya → produknya mati. |
| Bedanya dengan RentAHuman / HUMAN Protocol / Payman? | RentAHuman = marketplace matching AI↔manusia yang sudah ada — kami TIDAK klaim pertama; diferensiasi kami di proof layer: challenge-bound evidence, verifikasi berlapis, forceRelease, audit trail, IDRX. HUMAN = job market manual, bukan agent-native. Payman ($13,8M, Visa) = API fintech rails AS, tertutup. Funding mereka justru bukti tesisnya valid. |
| Revenue? | Fee 2–5% per task + API x402 untuk agent eksternal yang mau menyewa manusia. |
| Skalanya? | Data labeling $10M+ miliar; AV companies bayar $4 juta/kuartal cuma untuk data peta Hivemapper. Setiap agent economy butuh human layer — kami standarnya. |

---

## 9. Struktur Repo

```
Web3AI_Agent/
├── contracts/        # Hardhat: TaskEscrow.sol + tests
├── agent/            # TypeScript: Claude loop, viem wallet, verifier
├── worker-app/       # Next.js PWA + relayer API
├── dashboard/        # layar "mata agent" untuk demo
├── docs/             # spec, plan, pitch material
└── BLUEPRINT.md      # dokumen ini
```

---

## Alternatif yang Dipertimbangkan (dan kenapa kalah)

1. **Warung CFO Agent** — AI bendahara UMKM (kas IDRX, bayar supplier, credit scoring on-chain). Kuat secara lokal, tapi demo "pembukuan" datar di panggung, dan lebih cocok track Finance.
2. **Agent Waris / Dead-man Switch** — emosional dan simpel, tapi demo-nya sulit (tidak ada yang "terjadi" live) dan kurang menunjukkan otonomi berkelanjutan.
3. **Trading / portfolio agent** — 70% ruangan akan pitching ini. Langsung coret.

MANDOR menang di tiga kriteria: **original** (inversi relasi manusia-AI), **langsung ngerti** (satu kalimat cukup), **nggak complex tapi mantap** (satu kontrak + satu loop + satu PWA, tapi live demo-nya bikin ruangan berdiri) — plus sekarang **berakar di masalah nyata yang terdokumentasi**, bukan sekadar gimmick.
