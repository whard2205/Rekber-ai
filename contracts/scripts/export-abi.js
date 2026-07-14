const fs = require("fs");
const path = require("path");

// Salin ABI hasil compile ke agent/src/abi/ dan worker-app/src/abi/ supaya
// keduanya tidak bergantung pada artifacts hardhat.
const contracts = ["TaskEscrow", "MockIDRX"];
const outDirs = [
  path.join(__dirname, "..", "..", "agent", "src", "abi"),
  path.join(__dirname, "..", "..", "worker-app", "src", "abi"),
];

for (const name of contracts) {
  const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", `${name}.sol`, `${name}.json`);
  const { abi } = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  for (const outDir of outDirs) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(abi, null, 2));
    console.log(`exported ${name} -> ${path.join(outDir, `${name}.json`)}`);
  }
}
