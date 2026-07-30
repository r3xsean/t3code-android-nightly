import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { companionExpoConfig } from "./companion-contract.mjs";

export function publisherConfig({
  expoProjectId,
  expoOwner,
  updateChannel,
  runtimeVersion,
  versionName,
}) {
  return {
    expo: companionExpoConfig({
      expoProjectId,
      expoOwner,
      updateChannel,
      runtimeVersion,
      versionName,
    }),
  };
}

export function publisherPackage({ versionName }) {
  return {
    name: "t3-code-android-nightly-publisher",
    version: versionName,
    private: true,
    dependencies: {
      "expo-updates": "56.0.19",
    },
  };
}

async function main() {
  const [directory] = process.argv.slice(2);
  if (!directory) {
    throw new Error("Usage: eas-publisher.mjs <publisher-directory>");
  }
  const config = publisherConfig({
    expoProjectId: process.env.EXPO_PROJECT_ID,
    expoOwner: process.env.EXPO_OWNER,
    updateChannel: process.env.EXPO_UPDATE_CHANNEL,
    runtimeVersion: process.env.NATIVE_FINGERPRINT,
    versionName: process.env.VERSION_NAME,
  });
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "app.json"),
    `${JSON.stringify(config, null, 2)}\n`,
  );
  await writeFile(
    path.join(directory, "package.json"),
    `${JSON.stringify(publisherPackage({ versionName: process.env.VERSION_NAME }), null, 2)}\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
