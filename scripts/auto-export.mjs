import { execSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";

const EXPORT_INTERVAL_MS = 600000; // 10 minutes
const HEARTBEAT_INTERVAL_MS = 10000;

function ts() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function recoverFromFirebaseExport() {
  const exportDir = readdirSync(".", { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("firebase-export"))
    .sort((a, b) => b.name.localeCompare(a.name))[0];

  if (!exportDir) return false;

  console.log(`[${ts()}] Found ${exportDir.name} — copying to emulator-data`);

  if (existsSync("emulator-data")) {
    rmSync("emulator-data", { recursive: true, force: true });
  }

  try {
    cpSync(exportDir.name, "emulator-data", { recursive: true, force: true });
    rmSync(exportDir.name, { recursive: true, force: true });
    console.log(`[${ts()}] Recovery successful`);
    return true;
  } catch (err) {
    console.error(`[${ts()}] Copy failed: ${err.message}`);
    return false;
  }
}

function exportNow() {
  console.log(`[${ts()}] Exporting emulators → emulator-data`);
  try {
    execSync("firebase emulators:export ./.firebase-export-temp", { stdio: "inherit" });
  } catch {
    console.error(`[${ts()}] Export command failed`);
  }
  recoverFromFirebaseExport();
}

console.log(`Auto-export every ${EXPORT_INTERVAL_MS / 1000}s. Ctrl+C to stop.`);
setInterval(() => console.log(`[${ts()}] heartbeat`), HEARTBEAT_INTERVAL_MS);
exportNow();
setInterval(exportNow, EXPORT_INTERVAL_MS);
