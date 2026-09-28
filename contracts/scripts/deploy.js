const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

// Deploy MockIDRX + RekberEscrow.
// Env (lihat .env.example): AI_ARBITER_ADDRESS, HUMAN_ARBITER_ADDRESS, FEE_RECIPIENT,
// FEE_BPS, SHIP_WINDOW, CONFIRM_WINDOW, DISPUTE_WINDOW (semua opsional di localhost —
// default hardhat account #1 = aiArbiter, #0 = deployer/humanArbiter/feeRecipient, sesuai
// docs/rekber-ai/PLAN.md §3.7 "Lokal"; wajib diisi eksplisit di testnet/mainnet).
// Tidak minting saat deploy — saldo demo pembeli datang dari /api/faucet (web).
async function main() {
  const [deployer, hardhatAiArbiter] = await ethers.getSigners();
  const isLocal = network.name === "localhost" || network.name === "hardhat";

  const aiArbiter = process.env.AI_ARBITER_ADDRESS || (isLocal ? hardhatAiArbiter.address : "");
  const humanArbiter = process.env.HUMAN_ARBITER_ADDRESS || (isLocal ? deployer.address : "");
  const feeRecipient = process.env.FEE_RECIPIENT || (isLocal ? deployer.address : "");
  if (!aiArbiter || !humanArbiter || !feeRecipient) {
    throw new Error(
      "AI_ARBITER_ADDRESS, HUMAN_ARBITER_ADDRESS, FEE_RECIPIENT wajib diisi di luar localhost (lihat .env.example)",
    );
  }

  const feeBps = Number(process.env.FEE_BPS || 100);
  const shipWindow = Number(process.env.SHIP_WINDOW || 1800);
  const confirmWindow = Number(process.env.CONFIRM_WINDOW || 600);
  const disputeWindow = Number(process.env.DISPUTE_WINDOW || 1800);

  const idrx = await (await ethers.getContractFactory("MockIDRX")).deploy();
  await idrx.waitForDeployment();

  const escrow = await (
    await ethers.getContractFactory("RekberEscrow")
  ).deploy(
    await idrx.getAddress(),
    aiArbiter,
    humanArbiter,
    feeRecipient,
    feeBps,
    shipWindow,
    confirmWindow,
    disputeWindow,
  );
  await escrow.waitForDeployment();
  const receipt = await escrow.deploymentTransaction().wait();

  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    escrow: await escrow.getAddress(),
    token: await idrx.getAddress(),
    aiArbiter,
    humanArbiter,
    feeRecipient,
    feeBps,
    windows: { ship: shipWindow, confirm: confirmWindow, dispute: disputeWindow },
    deployBlock: receipt.blockNumber,
    deployedAt: new Date().toISOString(),
  };

  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${network.name}.json`), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
