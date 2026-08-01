import { appendFile, readFile } from "node:fs/promises";

import { FINGERPRINT_PATTERN } from "./companion-contract.mjs";

function validFingerprint(value) {
  if (!FINGERPRINT_PATTERN.test(value ?? "")) {
    throw new Error("Expected a 40-character lowercase native fingerprint hash");
  }
  return value;
}

export function parseFingerprintOutput(output) {
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("Could not parse Expo fingerprint output");
  }
  if (!FINGERPRINT_PATTERN.test(parsed?.hash ?? "")) {
    throw new Error("Expo fingerprint output is missing a valid fingerprint hash");
  }
  return parsed.hash;
}

export function chooseDelivery(
  candidateFingerprint,
  nativeBase,
  expected = {},
) {
  validFingerprint(candidateFingerprint);
  if (nativeBase === null || nativeBase === undefined) {
    return "apk";
  }
  validFingerprint(nativeBase.native_fingerprint);
  if (!expected.expoProjectId) {
    throw new Error("Missing expected Expo project ID");
  }
  if (!expected.updateChannel) {
    throw new Error("Missing expected Expo update channel");
  }
  if (nativeBase.expo_project_id !== expected.expoProjectId) {
    throw new Error("Native base belongs to a different Expo project");
  }
  if (nativeBase.expo_update_channel !== expected.updateChannel) {
    throw new Error("Native base belongs to a different Expo update channel");
  }
  if (expected.forceNative === true) {
    return "apk";
  }
  return nativeBase.native_fingerprint === candidateFingerprint ? "ota" : "apk";
}

function forceNativeRecoveryFromEnv(value) {
  if (value === undefined || value === "" || value === "false") {
    return false;
  }
  if (value === "true") {
    return true;
  }
  throw new Error("FORCE_NATIVE_RECOVERY must be true or false");
}

async function main() {
  const [fingerprintPath, nativeBaseJson = "null"] = process.argv.slice(2);
  if (!fingerprintPath) {
    throw new Error(
      "Usage: hybrid-delivery.mjs <fingerprint-json> [native-base-json]",
    );
  }
  const fingerprint = parseFingerprintOutput(
    await readFile(fingerprintPath, "utf8"),
  );
  const nativeBase = JSON.parse(nativeBaseJson);
  const delivery = chooseDelivery(fingerprint, nativeBase, {
    expoProjectId: process.env.EXPO_PROJECT_ID,
    updateChannel: process.env.EXPO_UPDATE_CHANNEL,
    forceNative: forceNativeRecoveryFromEnv(
      process.env.FORCE_NATIVE_RECOVERY,
    ),
  });
  const lines = `delivery=${delivery}\nnative_fingerprint=${fingerprint}\n`;
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, lines);
  } else {
    process.stdout.write(lines);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
