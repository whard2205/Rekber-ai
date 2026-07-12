const fs = require("fs");
const path = require("path");

// Salin ABI hasil compile ke agent/src/abi/ supaya agent tidak bergantung pada artifacts hardhat.
const contracts = ["TaskEscrow", "MockIDRX"];
const outDir = path.join(__dirname, "..", "..", "agent", "src", "abi");
fs.mkdirSync(outDir, { recursive: true });

for (const name of contracts) {
  const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", `${name}.sol`, `${name}.json`);
  const { abi } = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(abi, null, 2));
  console.log(`exported ${name} -> ${path.join(outDir, `${name}.json`)}`);
}
