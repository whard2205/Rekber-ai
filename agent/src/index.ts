import { runMission } from "./loop.js";

const goal = process.argv.slice(2).join(" ").trim();
if (!goal) {
  console.error('Pakai: npm start -- "goal untuk agent"');
  console.error('Contoh: npm start -- "Saya butuh 2 foto jempol dari orang di sekitar venue"');
  process.exit(1);
}

runMission(goal).catch((err) => {
  console.error("Mission gagal:", err);
  process.exit(1);
});
