import test from "node:test";
import assert from "node:assert/strict";

import { certificateSha256 } from "../scripts/apk-certificate.mjs";

const fingerprint =
  "3EAAE08EE4FA2F8A2D2A85FE359840267F6E022B1963C19A60768D96EE40578B";

test("parses current apksigner certificate output", () => {
  assert.equal(
    certificateSha256(
      `Number of signers: 1\n` +
        `Signer #1 certificate SHA-256 digest: ${fingerprint.toLowerCase()}\n`,
    ),
    fingerprint,
  );
});

test("normalizes indented, colon-delimited, CRLF output", () => {
  const delimited = fingerprint.match(/.{2}/g).join(":");
  assert.equal(
    certificateSha256(
      `Number of signers: 1\r\n` +
        `  Signer #1 certificate SHA-256 digest: ${delimited}\r\n`,
    ),
    fingerprint,
  );
});

test("rejects missing and malformed certificate output", () => {
  assert.throws(
    () => certificateSha256("Verified\n"),
    /Expected exactly one APK signer, found 0/,
  );
  assert.throws(
    () =>
      certificateSha256(
        "Number of signers: 1\n" +
          "Signer #1 certificate SHA-256 digest: ABCD\n",
      ),
    /Could not read signing certificate fingerprint/,
  );
});

test("rejects APKs with multiple signers", () => {
  assert.throws(
    () =>
      certificateSha256(
        `Number of signers: 2\n` +
          `Signer #1 certificate SHA-256 digest: ${fingerprint}\n` +
          `Signer #2 certificate SHA-256 digest: ${fingerprint}\n`,
      ),
    /Expected exactly one APK signer, found 2/,
  );
});

test("parses Build Tools 37 V3 signer output", () => {
  assert.equal(
    certificateSha256(
      "Verifies\n" +
        "Verified using v3 scheme (APK Signature Scheme v3): true\n" +
        "Number of signers: 1\n" +
        "V3.0 Signer: certificate DN: CN=T3 Code Android Nightly Companion\n" +
        `V3.0 Signer: certificate SHA-256 digest: ${fingerprint.toLowerCase()}\n`,
    ),
    fingerprint,
  );
});
