import { readFile } from "node:fs/promises";

export function certificateSha256(apksignerOutput) {
  const signerCount = Number.parseInt(
    apksignerOutput.match(/^Number of signers: (\d+)\r?$/m)?.[1] ?? "",
    10,
  );
  if (signerCount !== 1) {
    throw new Error(
      `Expected exactly one APK signer, found ${
        Number.isInteger(signerCount) ? signerCount : 0
      }`,
    );
  }
  const matches = [
    ...apksignerOutput.matchAll(
      /^(?:[ \t]*Signer #\d+|[^\r\n]*Signer:)[ \t]+certificate SHA-256 digest:[ \t]*([0-9a-fA-F: \t]+)\r?$/gm,
    ),
  ];
  const fingerprints = new Set(
    matches.map((match) =>
      match[1]
        .replaceAll(":", "")
        .replaceAll(/[ \t]/g, "")
        .toUpperCase(),
    ),
  );
  if (
    fingerprints.size !== 1 ||
    !/^[0-9A-F]{64}$/.test([...fingerprints][0] ?? "")
  ) {
    throw new Error("Could not read signing certificate fingerprint");
  }
  return [...fingerprints][0];
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
