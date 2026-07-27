import test from "node:test";
import assert from "node:assert/strict";

import { certificateSha256 } from "../scripts/apk-certificate.mjs";

const fingerprint =
  "3EAAE08EE4FA2F8A2D2A85FE359840267F6E022B1963C19A60768D96EE40578B";

test("parses current apksigner certificate output", () => {
  assert.equal(
    certificateSha256(
      `Signer #1 certificate SHA-256 digest: ${fingerprint.toLowerCase()}\n`,
    ),
    fingerprint,
  );
});

test("normalizes indented, colon-delimited, CRLF output", () => {
  const delimited = fingerprint.match(/.{2}/g).join(":");
  assert.equal(
    certificateSha256(
      `  Signer #1 certificate SHA-256 digest: ${delimited}\r\n`,
    ),
    fingerprint,
  );
});

test("rejects missing and malformed certificate output", () => {
  assert.throws(
    () => certificateSha256("Verified\n"),
    /Could not read signing certificate fingerprint/,
  );
  assert.throws(
    () => certificateSha256("Signer #1 certificate SHA-256 digest: ABCD\n"),
    /Could not read signing certificate fingerprint/,
  );
});
