const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

// Deploy MockIDRX + TaskEscrow.
// Env (opsional): RELAYER_ADDRESS, VERIFY_WINDOW (detik), CLAIM_WINDOW (detik),
// AGENT_ADDRESS (penerima mint awal)
async function main() {
  const [deployer] = await ethers.getSigners();
  const relayer = process.env.RELAYER_ADDRESS || deployer.address;
  const verifyWindow = Number(process.env.VERIFY_WINDOW || 24 * 60 * 60);
  // O-10: task Claimed tanpa proof selama ini bisa diambil alih worker lain.
  const claimWindow = Number(process.env.CLAIM_WINDOW || 10 * 60);
  const agent = process.env.AGENT_ADDRESS || deployer.address;

  const idrx = await (await ethers.getContractFactory("MockIDRX")).deploy();
  await idrx.waitForDeployment();

  const escrow = await (
    await ethers.getContractFactory("TaskEscrow")
  ).deploy(relayer, verifyWindow, claimWindow);
  await escrow.waitForDeployment();

  // Modal awal agent: Rp 10.000.000,00 (IDRX 2 desimal)
  await (await idrx.mint(agent, 1_000_000_000n)).wait();

  const out = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    escrow: await escrow.getAddress(),
    idrx: await idrx.getAddress(),
    relayer,
    verifyWindow,
    claimWindow,
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
