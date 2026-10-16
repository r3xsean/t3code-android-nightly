import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Both production and repair builds run this before dependency installation.
// Compose with upstream's pnpm patch so reinstalls and fingerprints see the fix.
async function main() {
  const sourceRoot = process.argv[2];
  if (!sourceRoot) throw new Error("Usage: upstream-compat.mjs <source-root>");
  const mobile = JSON.parse(await readFile(path.join(sourceRoot, "apps/mobile/package.json"), "utf8"));
  if (mobile.dependencies?.["expo-widgets"] !== "58.0.18") return;

  const workspace = await readFile(path.join(sourceRoot, "pnpm-workspace.yaml"), "utf8");
  const registrations = [...workspace.matchAll(/^  expo-widgets@58\.0\.18: (.+)$/gm)];
  if (registrations.length !== 1 || registrations[0][1] !== "patches/expo-widgets@58.0.18.patch") {
    throw new Error("Unexpected expo-widgets patch registration; upstream changed");
  }
  const patchPath = path.join(sourceRoot, registrations[0][1]);
  const lockPath = path.join(sourceRoot, "pnpm-lock.yaml");
  const original = await readFile(patchPath, "utf8");
  const lock = await readFile(lockPath, "utf8");
  const digest = (text) => createHash("sha256").update(text).digest("hex");
  const oldHash = digest(original);
  const hashes = [...lock.matchAll(/^  expo-widgets@58\.0\.18: ([a-f0-9]{64})$/gm)];
  if (hashes.length !== 1 || hashes[0][1] !== oldHash || !lock.includes(`patch_hash=${oldHash}`)) {
    throw new Error("Inconsistent expo-widgets patch hash; refusing to change the lockfile");
  }
  const repair = await readFile(new URL("../patches/expo-widgets-58.0.18-peek-imports.patch", import.meta.url), "utf8");
  if (original.endsWith(repair)) return;
  if (original.includes("android/src/main/java/expo/modules/widgets/notifications/")) {
    throw new Error("Upstream already patches widgets notifications; review the overlapping repair");
  }
  const composed = `${original}${original.endsWith("\n") ? "" : "\n"}${repair}`;
  const updatedLock = lock.replaceAll(oldHash, digest(composed));
  await writeFile(patchPath, composed);
  await writeFile(lockPath, updatedLock);
  console.log("Repaired expo-widgets 58.0.18 Peek imports in the locked upstream patch");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
