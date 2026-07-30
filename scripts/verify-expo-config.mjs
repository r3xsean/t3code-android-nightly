import { readFile } from "node:fs/promises";

export function verifyExpoConfig(config, expected) {
  const checks = [
    config?.name === "T3 Code Nightly",
    config?.owner === expected.expoOwner,
    config?.version === expected.versionName,
    config?.runtimeVersion === expected.runtimeVersion,
    config?.updates?.enabled === true,
    config?.updates?.url ===
      `https://u.expo.dev/${expected.expoProjectId}`,
    config?.updates?.requestHeaders?.["expo-channel-name"] ===
      expected.updateChannel,
    config?.updates?.checkAutomatically === "ON_LOAD",
    config?.updates?.fallbackToCacheTimeout === 0,
    config?.android?.package === "dev.r3xsean.t3code.nightly",
    config?.extra?.eas?.projectId === expected.expoProjectId,
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
