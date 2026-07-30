import { readFile } from "node:fs/promises";

import { companionExpoConfig } from "./companion-contract.mjs";

export function verifyExpoConfig(config, expected) {
  const contract = companionExpoConfig(expected);
  const checks = [
    config?.name === contract.name,
    config?.slug === contract.slug,
    config?.scheme === contract.scheme,
    config?.owner === contract.owner,
    config?.version === contract.version,
    config?.runtimeVersion === contract.runtimeVersion,
    config?.updates?.enabled === contract.updates.enabled,
    config?.updates?.url === contract.updates.url,
    config?.updates?.requestHeaders?.["expo-channel-name"] ===
      contract.updates.requestHeaders["expo-channel-name"],
    config?.updates?.checkAutomatically ===
      contract.updates.checkAutomatically,
    config?.updates?.fallbackToCacheTimeout ===
      contract.updates.fallbackToCacheTimeout,
    config?.android?.package === contract.android.package,
    config?.extra?.eas?.projectId === contract.extra.eas.projectId,
  ];
  if (checks.some((check) => !check)) {
    throw new Error("Resolved companion Expo configuration mismatch");
  }
}

async function main() {
  const [configPath] = process.argv.slice(2);
  if (!configPath) {
    throw new Error("Usage: verify-expo-config.mjs <public-config-json>");
  }
  verifyExpoConfig(JSON.parse(await readFile(configPath, "utf8")), {
    expoProjectId: process.env.EXPO_PROJECT_ID,
    expoOwner: process.env.EXPO_OWNER,
    updateChannel: process.env.EXPO_UPDATE_CHANNEL,
    runtimeVersion: process.env.NATIVE_FINGERPRINT,
    versionName: process.env.VERSION_NAME,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
