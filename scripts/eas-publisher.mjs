import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { companionExpoConfig } from "./companion-contract.mjs";
import {
  resolveConnectPublicConfig,
  verifyExpoConfig as verifyConnectExpoConfig,
} from "./connect-config.mjs";

export function publisherConfig(
  {
    expoProjectId,
    expoOwner,
    updateChannel,
    runtimeVersion,
    versionName,
  },
  connectEnv,
) {
  const expo = companionExpoConfig({
    expoProjectId,
    expoOwner,
    updateChannel,
    runtimeVersion,
    versionName,
  });
  const connect = resolveConnectPublicConfig(connectEnv);
  expo.extra = {
    ...expo.extra,
    clerk: {
      publishableKey: connect.T3CODE_CLERK_PUBLISHABLE_KEY,
      jwtTemplate: connect.T3CODE_CLERK_JWT_TEMPLATE,
    },
    relay: {
      url: connect.T3CODE_RELAY_URL,
    },
  };
  verifyConnectExpoConfig(expo, connect);
  return { expo };
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
  const config = publisherConfig(
    {
      expoProjectId: process.env.EXPO_PROJECT_ID,
      expoOwner: process.env.EXPO_OWNER,
      updateChannel: process.env.EXPO_UPDATE_CHANNEL,
      runtimeVersion: process.env.NATIVE_FINGERPRINT,
      versionName: process.env.VERSION_NAME,
    },
    process.env,
  );
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
