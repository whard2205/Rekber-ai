# MANDOR MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI agent yang memposting task ber-escrow on-chain, memverifikasi bukti kerja manusia pakai vision, dan membayar otomatis — end-to-end di local chain, siap deploy ke Base Sepolia.

**Architecture:** Tiga workspace independen (npm terpisah, bukan monorepo workspace — minim risiko tooling di Windows): `contracts/` (Hardhat 2 + ethers v6), `agent/` (TypeScript + Claude API + viem), `worker-app/` (Next.js PWA + relayer API, fase B). ABI mengalir dari contracts → agent via copy script. Semua aksi worker di-relay (worker tanpa gas); semua aksi agent ditandatangani wallet agent sendiri.

**Tech Stack:** Solidity 0.8.24, OpenZeppelin 5, Hardhat 2 + @nomicfoundation/hardhat-toolbox, TypeScript, @anthropic-ai/sdk, viem, Next.js (fase B).

**Spec:** `BLUEPRINT.md` (root). Keputusan kunci dari spec: escrow lock sebelum kerja; worker recourse via `forceRelease` (kalau agent tidak memverifikasi dalam `verifyWindow`, worker tetap dibayar — jawaban struktural untuk kasus Remotasks); multi-worker = N task identik; reject → reopen, dana tidak pernah kembali ke agent kecuali task kadaluarsa tanpa submission.

---

## Fase A — Kontrak + Agent (plan ini, detail penuh)

### Task 0: Scaffold repo + git init

**Files:** Create `.gitignore`, `contracts/`, `agent/`, `docs/`

- [ ] **Step 1:** `git init`, buat `.gitignore` root:

```gitignore
node_modules/
.env
.env.*
!.env.example
artifacts/
cache/
typechain-types/
.next/
dist/
uploads/
```

- [ ] **Step 2:** `npm init -y` di `contracts/` dan `agent/`; install:
  - contracts: `npm i -D hardhat@^2.26 @nomicfoundation/hardhat-toolbox@^6 && npm i @openzeppelin/contracts@^5`
  - agent: `npm i @anthropic-ai/sdk viem dotenv && npm i -D typescript tsx @types/node`
- [ ] **Step 3:** Commit `chore: scaffold contracts + agent workspaces`

### Task 1: MockIDRX (fixture token)

**Files:** Create `contracts/contracts/MockIDRX.sol`, `contracts/hardhat.config.js`

- [ ] **Step 1:** Hardhat config: solidity 0.8.24, optimizer on (runs 200).
- [ ] **Step 2:** `MockIDRX.sol` — ERC20 OpenZeppelin, 2 desimal (meniru IDRX asli), fungsi `mint(address,uint256)` publik (testnet faucet). Compile hijau: `npx hardhat compile`.
- [ ] **Step 3:** Commit `feat(contracts): MockIDRX test token`

### Task 2: TaskEscrow — state machine inti (TDD)

**Files:** Create `contracts/contracts/TaskEscrow.sol`, `contracts/test/TaskEscrow.test.js`

**Interface yang dikunci (dipakai agent & worker-app — jangan diubah tanpa update plan):**

```solidity
enum Status { None, Open, Claimed, Submitted, Paid, Refunded }
struct Task {
  address agent; address token; uint96 bounty; bytes32 specHash;
  address worker; bytes32 proofHash; uint40 deadline; uint40 submittedAt; Status status;
}
// constructor(address relayer_, uint40 verifyWindow_)
function postTask(address token, uint96 bounty, bytes32 specHash, uint40 deadline) returns (uint256 taskId)
function claimTask(uint256 taskId)                          // worker langsung
function claimFor(uint256 taskId, address worker)           // onlyRelayer
function submitProof(uint256 taskId, bytes32 proofHash)     // only worker
function submitProofFor(uint256 taskId, address worker, bytes32 proofHash) // onlyRelayer
function releaseBounty(uint256 taskId)                      // only task.agent, Submitted → Paid
function rejectAndReopen(uint256 taskId)                    // only task.agent, Submitted → Open (clear worker+proof)
function refundExpired(uint256 taskId)                      // anyone; deadline lewat & status Open/Claimed → Refunded ke agent
function forceRelease(uint256 taskId)                       // anyone; Submitted & submittedAt+verifyWindow lewat → Paid ke worker
// Events: TaskPosted(taskId, agent, token, bounty, specHash, deadline),
// TaskClaimed(taskId, worker), ProofSubmitted(taskId, worker, proofHash),
// BountyReleased(taskId, worker, amount), TaskReopened(taskId), TaskRefunded(taskId)
// Custom errors: InvalidState, NotAgent, NotWorker, NotRelayer, ZeroBounty,
// BadDeadline, DeadlinePassed, DeadlineNotPassed, VerifyWindowActive
```

**Aturan dana (inti pitch, wajib ditegakkan test):** dana hanya bisa keluar ke (a) worker via release/forceRelease, atau (b) balik ke agent via refundExpired dari Open/Claimed. Agent TIDAK PERNAH bisa menarik dana setelah ada proof tersubmit — pilihan agent cuma bayar atau reopen.

- [ ] **Step 1:** Tulis test suite lengkap (failing) — kelompok per fungsi:
  - postTask: saldo escrow naik sejumlah bounty; task tersimpan benar; event; id inkremental; revert ZeroBounty, BadDeadline (deadline ≤ now)
  - claimTask: Open→Claimed, worker terset, event; revert double-claim (InvalidState); revert setelah deadline (DeadlinePassed); claimFor: hanya relayer (NotRelayer)
  - submitProof: Claimed→Submitted, proofHash+submittedAt terset, event; revert bukan worker (NotWorker); revert dari Open (InvalidState); submitProofFor: hanya relayer
  - releaseBounty: Submitted→Paid, saldo worker naik, event; revert bukan agent (NotAgent); revert dari Claimed (InvalidState); revert dobel-release
  - rejectAndReopen: Submitted→Open, worker+proof+submittedAt kosong; worker lain bisa claim; revert bukan agent
  - refundExpired: dari Open & dari Claimed setelah deadline → saldo agent balik; revert sebelum deadline (DeadlineNotPassed); revert dari Submitted (InvalidState)
  - forceRelease: setelah verifyWindow → worker dibayar walau agent diam; revert sebelum window habis (VerifyWindowActive); revert dari status lain
- [ ] **Step 2:** `npx hardhat test` → semua FAIL (kontrak belum ada)
- [ ] **Step 3:** Implement `TaskEscrow.sol` minimal sampai hijau. SafeERC20, ReentrancyGuard di fungsi transfer-out.
- [ ] **Step 4:** `npx hardhat test` → PASS semua.
- [ ] **Step 5:** Commit `feat(contracts): TaskEscrow escrow state machine + full test suite`

### Task 3: Deploy script + ABI export

**Files:** Create `contracts/scripts/deploy.js`, `contracts/scripts/export-abi.js`

- [ ] **Step 1:** `deploy.js`: deploy MockIDRX + TaskEscrow(relayer, verifyWindow=86400), mint saldo ke agent, log alamat sebagai JSON ke `deployments/<network>.json`.
- [ ] **Step 2:** `export-abi.js`: copy ABI TaskEscrow + MockIDRX dari artifacts → `../agent/src/abi/`.
- [ ] **Step 3:** Uji di local node (`npx hardhat node` + deploy ke localhost), commit `feat(contracts): deploy + ABI export scripts`

### Task 4: Agent — chain layer

**Files:** Create `agent/tsconfig.json`, `agent/src/config.ts`, `agent/src/chain.ts`, `agent/.env.example`

- [ ] **Step 1:** `config.ts`: baca env (RPC_URL, CHAIN_ID, AGENT_PRIVATE_KEY, ESCROW_ADDRESS, TOKEN_ADDRESS, ANTHROPIC_API_KEY, MANDOR_MOCK_BRAIN) dengan validasi manual + error jelas.
- [ ] **Step 2:** `chain.ts`: viem wallet+public client; fungsi `approveToken`, `postTask`, `releaseBounty`, `rejectAndReopen`, `getTask`, `watchProofSubmitted` (polling getLogs interval 2s, return unwatch). Semua return/consume tipe eksplisit `OnchainTask`.
- [ ] **Step 3:** Commit `feat(agent): chain layer (viem)`

### Task 5: Agent — brain (Claude planning + vision verify)

**Files:** Create `agent/src/brain.ts`, `agent/src/types.ts`

- [ ] **Step 1:** `types.ts`: `HumanTaskSpec { title, instructions, acceptanceCriteria[], bountyIDRX }`, `Verdict { decision: "pass"|"fail", reasoning }`.
- [ ] **Step 2:** `brain.ts`:
  - `planTasks(goal: string): Promise<HumanTaskSpec[]>` — Claude tool-use dengan JSON schema ketat (bukan parsing regex).
  - `verifyProof(spec: HumanTaskSpec, imageBase64: string, mediaType): Promise<Verdict>` — vision + kriteria; ragu = fail dengan alasan (bias aman: reopen, bukan bayar).
  - Model dari env `ANTHROPIC_MODEL`, cek claude-api skill untuk default yang benar.
  - `MANDOR_MOCK_BRAIN=1` → implementasi mock deterministik (untuk test loop offline, dilabel jelas di log).
- [ ] **Step 3:** Commit `feat(agent): brain — planning + vision verification`

### Task 6: Agent — orchestrator loop + CLI

**Files:** Create `agent/src/loop.ts`, `agent/src/index.ts`, `agent/package.json` scripts

- [ ] **Step 1:** `loop.ts` — `runMission(goal)`: plan → approve token → post semua task (simpan spec per taskId di Map + `missions/<ts>.json`) → watch ProofSubmitted → ambil bukti dari proof store (v0: file/URL dari relayer) → verify → release/reject → selesai saat semua Paid → report markdown ke stdout + file.
- [ ] **Step 2:** `index.ts` CLI: `npm start -- "<goal>"`; scripts: `start`, `typecheck` (`tsc --noEmit`).
- [ ] **Step 3:** Smoke test lokal: hardhat node + deploy + `MANDOR_MOCK_BRAIN=1` + script `scripts/fake-worker.ts` (claim+submit via relayer key) → mission selesai end-to-end tanpa API key. Expected: log "MISSION COMPLETE", task Paid on-chain.
- [ ] **Step 4:** Commit `feat(agent): mission loop + CLI + local e2e smoke`

## Fase B — Worker PWA + relayer (plan terpisah menyusul, interface sudah dikunci)

Next.js app: task list (baca chain via public client), claim/submit via API route yang memegang relayer key (`claimFor`/`submitProofFor`), upload foto → `uploads/` + sha256 → proofHash (v0; Pinata IPFS menyusul), burner wallet address di localStorage sebagai identitas payout. UI mobile-first, bahasa Indonesia, 3 layar: Daftar Kerjaan / Detail+Upload / Riwayat Gaji.

## Fase C — Dashboard demo + deploy Base Sepolia + polish (plan terpisah menyusul)

Layar "mata agent": mission timeline, task cards live status, vision reasoning stream, link explorer per tx. Deploy Sepolia, ganti MockIDRX → IDRX asli di Base saat demo mainnet.

---

## Self-review

- Spec coverage: escrow lock ✓ (postTask), verifikasi vision ✓ (brain), gaji instan ✓ (releaseBounty), worker recourse ✓ (forceRelease), anti-rug agent ✓ (aturan dana + test), relayer gasless ✓ (claimFor/submitProofFor), multi-worker = N task ✓ (loop posts array). Worker PWA & dashboard = fase B/C by design.
- Placeholder scan: tidak ada TBD; semua task menyebut file, signature, assertion, dan command eksak.
- Type consistency: `HumanTaskSpec`/`Verdict` dipakai konsisten Task 5–6; nama fungsi kontrak identik di Task 2 (interface) dan Task 4 (chain layer).
