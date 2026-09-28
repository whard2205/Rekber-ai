import { runDaemon } from "./loop.js";

runDaemon().catch((err) => {
  console.error("Daemon berhenti:", err);
  process.exit(1);
});
