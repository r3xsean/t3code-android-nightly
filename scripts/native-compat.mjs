import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

const exec = promisify(execFile);
const versionPattern = /^\d+\.\d+\.\d+$/;
const marker = "// t3-companion: resolved fbjni compatibility";

export function expectedFbjni(catalog) {
  const matches = [...catalog.matchAll(/^fbjni\s*=\s*"(\d+\.\d+\.\d+)"\s*$/gm)];
  if (matches.length !== 1) throw new Error("Cannot determine React Native's required fbjni version");
  return matches[0][1];
}

export function compatibilityDecision(expected, resolved) {
  if (!versionPattern.test(expected) || !Array.isArray(resolved) || resolved.length !== 1 || !versionPattern.test(resolved[0])) {
    throw new Error("Missing or ambiguous resolved fbjni dependency");
  }
  return resolved[0] === expected ? "unchanged" : "repair";
}

export function compatibilityFingerprint(hash, expected) {
  if (!/^[a-f0-9]{40}$/.test(hash) || !versionPattern.test(expected)) throw new Error("Invalid native compatibility fingerprint input");
  return createHash("sha1").update(`t3-fbjni-contract-v1\n${hash}\n${expected}\n`).digest("hex");
}

export function repairGradle(source, expected, resolved) {
  if (compatibilityDecision(expected, resolved) === "unchanged") return source;
  if (source.includes(marker)) throw new Error("Existing fbjni repair did not resolve compatibility");
  return `${source}\n${marker}\nallprojects {\n    configurations.configureEach {\n        resolutionStrategy.force 'com.facebook.fbjni:fbjni:${expected}'\n    }\n}\n`;
}

async function requiredVersion(sourceRoot) {
  const require = createRequire(path.resolve(sourceRoot, "apps/mobile/package.json"));
  const reactNative = path.dirname(require.resolve("react-native/package.json"));
  return expectedFbjni(await readFile(path.join(reactNative, "gradle/libs.versions.toml"), "utf8"));
}

async function resolvedVersions(android) {
  const { stdout } = await exec("./gradlew", ["--init-script", fileURLToPath(new URL("./probe-fbjni.gradle", import.meta.url)),
    ":app:t3CompanionResolvedFbjni", "--quiet", "--no-daemon"], { cwd: android, timeout: 600_000, maxBuffer: 8 * 1024 * 1024 });
  const lines = stdout.split(/\r?\n/).filter((line) => line.startsWith("T3_FBJNi="));
  if (lines.length !== 1) throw new Error(`Gradle did not report a unique fbjni resolution: ${stdout.slice(-4000)}`);
  return JSON.parse(lines[0].slice("T3_FBJNi=".length));
}

async function main() {
  const [mode, sourceRoot, fingerprintPath] = process.argv.slice(2);
  if (!sourceRoot || !["fingerprint", "verify-gradle"].includes(mode)) throw new Error("Usage: native-compat.mjs fingerprint|verify-gradle <source-root> [fingerprint.json]");
  const expected = await requiredVersion(sourceRoot);
  if (mode === "fingerprint") {
    const data = JSON.parse(await readFile(fingerprintPath, "utf8"));
    if (data.companionNativeContract) throw new Error("Native compatibility fingerprint already applied");
    data.hash = compatibilityFingerprint(data.hash, expected);
    data.companionNativeContract = { fbjni: expected, revision: 1 };
    await writeFile(fingerprintPath, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`Native runtime includes React Native's fbjni ${expected} contract`);
    return;
  }
  const android = path.resolve(sourceRoot, "apps/mobile/android");
  const resolved = await resolvedVersions(android);
  if (compatibilityDecision(expected, resolved) === "unchanged") {
    console.log(`fbjni ${expected} already resolves correctly upstream; no workaround applied`);
    return;
  }
  const gradle = path.join(android, "build.gradle");
  await writeFile(gradle, repairGradle(await readFile(gradle, "utf8"), expected, resolved));
  const verified = await resolvedVersions(android);
  if (compatibilityDecision(expected, verified) !== "unchanged") throw new Error("fbjni compatibility repair failed verification");
  console.log(`Repaired resolved fbjni ${resolved[0]} -> ${expected}, matching installed React Native; verified release graph`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
