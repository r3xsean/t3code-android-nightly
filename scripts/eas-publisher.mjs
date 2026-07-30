import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NIGHTLY = /^\d+\.\d+\.\d+-nightly\.\d{8}\.\d+$/;
const FINGERPRINT = /^[0-9a-f]{40}$/;

export function publisherConfig({
  expoProjectId,
  expoOwner,
  updateChannel,
  runtimeVersion,
  versionName,
}) {
  if (!UUID.test(expoProjectId ?? "")) {
    throw new Error("Expo project ID must be a UUID");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(expoOwner ?? "")) {
    throw new Error("Expo owner is invalid");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(updateChannel ?? "")) {
    throw new Error("Expo update channel is invalid");
  }
  if (!FINGERPRINT.test(runtimeVersion ?? "")) {
    throw new Error("Expo runtime version must be a native fingerprint");
  }
  if (!NIGHTLY.test(versionName ?? "")) {
    throw new Error("Expo update version must be a nightly version");
  }

  return {
    expo: {
      name: "T3 Code Nightly",
      slug: "t3-code-android-nightly",
      owner: expoOwner,
      version: versionName,
      runtimeVersion,
      updates: {
        enabled: true,
        url: `https://u.expo.dev/${expoProjectId}`,
        requestHeaders: {
          "expo-channel-name": updateChannel,
        },
        checkAutomatically: "ON_LOAD",
        fallbackToCacheTimeout: 0,
      },
      android: {
        package: "dev.r3xsean.t3code.nightly",
      },
      extra: {
        eas: {
          projectId: expoProjectId,
        },
      },
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
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
