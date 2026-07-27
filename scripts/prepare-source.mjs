import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const APPLICATION_ID = "dev.r3xsean.t3code.nightly";
const DISPLAY_NAME = "T3 Code Nightly";

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

export function prepareConfig(source, { versionCode, versionName }) {
  if (!Number.isInteger(versionCode) || versionCode < 1) {
    throw new Error("versionCode must be a positive integer");
  }
  if (!/^\d+\.\d+\.\d+-nightly\.\d{8}\.\d+$/.test(versionName)) {
    throw new Error(`Invalid versionName: ${versionName}`);
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
  prepared = replaceExactlyOnce(
    prepared,
    "  updates: {\n    enabled: true,\n",
    "  updates: {\n    enabled: false,\n",
    "Expo update switch",
  );
  prepared = replaceExactlyOnce(
    prepared,
    "    package: variant.androidPackage,\n",
    `    package: "${APPLICATION_ID}",\n    versionCode: ${versionCode},\n`,
    "Android identity",
  );
  return prepared;
}

async function main() {
  const [sourceRoot, versionCodeText, versionName] = process.argv.slice(2);
  const versionCode = Number.parseInt(versionCodeText, 10);
  if (!sourceRoot || !versionName) {
    throw new Error(
      "Usage: prepare-source.mjs <source-root> <version-code> <version-name>",
    );
  }

  const configPath = path.join(sourceRoot, "apps/mobile/app.config.ts");
  const source = await readFile(configPath, "utf8");
  const prepared = prepareConfig(source, { versionCode, versionName });
  await writeFile(configPath, prepared);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
