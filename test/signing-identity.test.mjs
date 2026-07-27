import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { EXPECTED_CERTIFICATE_SHA256 } from "../scripts/publish-releases.mjs";

test("workflow, publication, and public signing documentation agree", async () => {
  const [workflow, signing] = await Promise.all([
    readFile(".github/workflows/android-nightly.yml", "utf8"),
    readFile("SIGNING.md", "utf8"),
  ]);
  const documented = signing
    .match(
      /(?:[0-9A-F]{2}:){31}[0-9A-F]{2}/,
    )?.[0]
    .replaceAll(":", "");
  assert.equal(documented, EXPECTED_CERTIFICATE_SHA256);
  const workflowMatches = [
    ...workflow.matchAll(
      /EXPECTED_CERTIFICATE_SHA256: ([0-9A-F]{64})/g,
    ),
  ].map((match) => match[1]);
  assert.ok(workflowMatches.length >= 2);
  assert.deepEqual(
    new Set(workflowMatches),
    new Set([EXPECTED_CERTIFICATE_SHA256]),
  );
});
