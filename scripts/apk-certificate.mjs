import { readFile } from "node:fs/promises";

export function certificateSha256(apksignerOutput) {
  const matches = [
    ...apksignerOutput.matchAll(
      /^[ \t]*Signer #\d+ certificate SHA-256 digest:[ \t]*([0-9a-fA-F: \t]+)\r?$/gm,
    ),
  ];
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one APK signer, found ${matches.length}`,
    );
  }
  const fingerprint = matches[0][1]
    .replaceAll(":", "")
    .replaceAll(/[ \t]/g, "")
    .toUpperCase();
  if (!fingerprint || !/^[0-9A-F]{64}$/.test(fingerprint)) {
    throw new Error("Could not read signing certificate fingerprint");
  }
  return fingerprint;
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    throw new Error("Usage: node apk-certificate.mjs <apksigner-output>");
  }
  process.stdout.write(`${certificateSha256(await readFile(path, "utf8"))}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
