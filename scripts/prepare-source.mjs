import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  APPLICATION_ID,
  DISPLAY_NAME,
  EXPO_SLUG,
  FINGERPRINT_PATTERN,
  FINGERPRINT_VERSION_CODE,
  FINGERPRINT_VERSION_NAME,
  validateCompanionDelivery,
  VERSION_NAME_PATTERN,
} from "./companion-contract.mjs";

function replaceExactlyOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  const last = source.lastIndexOf(search);
  if (first === -1 || first !== last) {
    throw new Error(
      `Expected exactly one ${label} insertion point; upstream config changed`,
    );
  }
  return source.replace(search, replacement);
}

function replacePatternExactlyOnce(source, pattern, replacement, label) {
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${label} insertion point; upstream config changed`,
    );
  }
  return source.replace(pattern, replacement);
}

function validateVersion({ versionCode, versionName }) {
  if (!Number.isInteger(versionCode) || versionCode < 1) {
    throw new Error("versionCode must be a positive integer");
  }
  if (!VERSION_NAME_PATTERN.test(versionName)) {
    throw new Error(`Invalid versionName: ${versionName}`);
  }
}

export function prepareConfig(
  source,
  {
    versionCode,
    versionName,
    expoProjectId,
    expoOwner,
    updateChannel,
  },
) {
  validateVersion({ versionCode, versionName });
  validateCompanionDelivery({ expoProjectId, expoOwner, updateChannel });

  let prepared = replaceExactlyOnce(
    source,
    '  name: variant.appName,\n',
    `  name: "${DISPLAY_NAME}",\n`,
    "application name",
  );
  prepared = replacePatternExactlyOnce(
    prepared,
    /^  slug: "[^"\r\n]+",\r?$/gm,
    `  slug: "${EXPO_SLUG}",`,
    "Expo slug",
  );
  prepared = replacePatternExactlyOnce(
    prepared,
    /^  version: "[^"\r\n]+",\r?$/gm,
    `  version: "${versionName}",`,
    "application version",
  );
  prepared = replacePatternExactlyOnce(
    prepared,
    /^    url: "https:\/\/u\.expo\.dev\/[0-9a-f-]+",\r?$/gm,
    `    url: "https://u.expo.dev/${expoProjectId}",\n    requestHeaders: {\n      "expo-channel-name": "${updateChannel}",\n    },`,
    "Expo update URL",
  );
  prepared = replaceExactlyOnce(
    prepared,
    '    checkAutomatically: "ON_LOAD",\n',
    '    checkAutomatically: "NEVER",\n',
    "Expo automatic update mode",
  );
  prepared = replaceExactlyOnce(
    prepared,
    "    package: variant.androidPackage,\n",
    `    package: "${APPLICATION_ID}",\n    versionCode: ${versionCode},\n`,
    "Android identity",
  );
  prepared = replacePatternExactlyOnce(
    prepared,
    /^      projectId: "[0-9a-f-]+",\r?$/gm,
    `      projectId: "${expoProjectId}",`,
    "Expo project ID",
  );
  prepared = replacePatternExactlyOnce(
    prepared,
    /^  owner: "[^"\r\n]+",\r?$/gm,
    `  owner: "${expoOwner}",`,
    "Expo owner",
  );
  return prepared;
}

export function prepareFingerprintConfig(
  source,
  { expoProjectId, expoOwner, updateChannel },
) {
  return prepareConfig(source, {
    versionCode: FINGERPRINT_VERSION_CODE,
    versionName: FINGERPRINT_VERSION_NAME,
    expoProjectId,
    expoOwner,
    updateChannel,
  });
}

export function finalizeConfig(
  source,
  { runtimeVersion, versionCode, versionName },
) {
  validateVersion({ versionCode, versionName });
  if (!FINGERPRINT_PATTERN.test(runtimeVersion ?? "")) {
    throw new Error("runtimeVersion must be a 40-character lowercase hex fingerprint");
  }

  let finalized = replacePatternExactlyOnce(
    source,
    /^  runtimeVersion: \{\r?\n[\s\S]*?^  \},\r?$/gm,
    `  runtimeVersion: "${runtimeVersion}",`,
    "runtime version",
  );
  finalized = replacePatternExactlyOnce(
    finalized,
    /^  version: "[^"\r\n]+",\r?$/gm,
    `  version: "${versionName}",`,
    "application version",
  );
  finalized = replacePatternExactlyOnce(
    finalized,
    /^    versionCode: \d+,\r?$/gm,
    `    versionCode: ${versionCode},`,
    "Android version code",
  );
  return finalized;
}

async function main() {
  const [mode, sourceRoot, versionCodeText, versionName, runtimeVersion] =
    process.argv.slice(2);
  if (!sourceRoot || !["fingerprint", "finalize"].includes(mode)) {
    throw new Error(
      "Usage: prepare-source.mjs fingerprint <source-root> | finalize <source-root> <version-code> <version-name> <runtime-version>",
    );
  }

  const configPath = path.join(sourceRoot, "apps/mobile/app.config.ts");
  const source = await readFile(configPath, "utf8");
  const prepared =
    mode === "finalize"
      ? finalizeConfig(source, {
          runtimeVersion,
          versionCode: Number.parseInt(versionCodeText, 10),
          versionName,
        })
      : prepareFingerprintConfig(source, {
          expoProjectId: process.env.EXPO_PROJECT_ID,
          expoOwner: process.env.EXPO_OWNER,
          updateChannel: process.env.EXPO_UPDATE_CHANNEL,
        });
  await writeFile(configPath, prepared);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
