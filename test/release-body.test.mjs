import test from "node:test";
import assert from "node:assert/strict";

import { releaseBody } from "../scripts/release-body.mjs";

test("records machine-readable versioning and human-readable provenance", () => {
  const body = releaseBody(
    {
      upstream_tag: "v0.0.29-nightly.20260727.922",
      upstream_release_id: 360641809,
      upstream_sha: "80ead5f3a7743010cdab6ad84fa4dcbd4c021038",
      upstream_published_at: "2026-07-27T18:54:45Z",
      version_code: 1785178485,
      version_name: "0.0.29-nightly.20260727.922",
    },
    "A".repeat(64),
  );
  assert.match(body, /<!-- android-version-code: 1785178485 -->/);
  assert.match(body, /80ead5f3a7743010cdab6ad84fa4dcbd4c021038/);
  assert.match(body, /dev\.r3xsean\.t3code\.nightly/);
});
