import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const APPLICATION_ID = "dev.r3xsean.t3code.nightly";
const DISPLAY_NAME = "T3 Code Nightly";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RUNTIME_VERSION = /^[0-9a-f]{40}$/;

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
  if (!/^\d+\.\d+\.\d+-nightly\.\d{8}\.\d+$/.test(versionName)) {
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
  if (!UUID.test(expoProjectId ?? "")) {
    throw new Error("expoProjectId must be a UUID");
  }
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,37}[A-Za-z0-9])?$/.test(expoOwner ?? "")) {
    throw new Error("expoOwner is invalid");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(updateChannel ?? "")) {
    throw new Error("updateChannel is invalid");
  }

  let prepared = replaceExactlyOnce(
    source,
    '  name: variant.appName,\n',
    `  name: "${DISPLAY_NAME}",\n`,
    "application name",
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

export function finalizeConfig(
  source,
  { runtimeVersion, versionCode, versionName },
) {
  validateVersion({ versionCode, versionName });
  if (!RUNTIME_VERSION.test(runtimeVersion ?? "")) {
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
  const [sourceRoot, versionCodeText, versionName, mode, runtimeVersion] =
    process.argv.slice(2);
  const versionCode = Number.parseInt(versionCodeText, 10);
  if (!sourceRoot || !versionName) {
    throw new Error(
      "Usage: prepare-source.mjs <source-root> <version-code> <version-name> [--finalize <runtime-version>]",
    );
  }

  const configPath = path.join(sourceRoot, "apps/mobile/app.config.ts");
  const source = await readFile(configPath, "utf8");
  const prepared =
    mode === "--finalize"
      ? finalizeConfig(source, { runtimeVersion, versionCode, versionName })
      : prepareConfig(source, {
          versionCode,
          versionName,
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
