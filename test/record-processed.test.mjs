import test from "node:test";
import assert from "node:assert/strict";

import {
  processedTagFromRefs,
  recordProcessed,
} from "../scripts/record-processed.mjs";

const sha = "a".repeat(40);

test("records durable processed state as a repository tag ref", async () => {
  const calls = [];
  const api = async (path, options) => {
    calls.push([path, options]);
    if (options === undefined) {
      throw Object.assign(new Error("missing"), { status: 404 });
    }
    return {};
  };
  await recordProcessed(
    api,
    "owner/repo",
    "v0.0.32-nightly.20260730.957",
    sha,
  );
  assert.equal(
    calls[0][0],
    "/repos/owner/repo/git/ref/tags/processed-nightly/v0.0.32-nightly.20260730.957",
  );
  assert.equal(calls[1][0], "/repos/owner/repo/git/refs");
  assert.deepEqual(JSON.parse(calls[1][1].body), {
    ref: "refs/tags/processed-nightly/v0.0.32-nightly.20260730.957",
    sha,
  });
});

test("is idempotent when the processed marker already exists", async () => {
  const calls = [];
  const api = async (path, options) => {
    calls.push([path, options]);
    return { ref: "refs/tags/processed-nightly/v0.0.32-nightly.20260730.957" };
  };
  await recordProcessed(
    api,
    "owner/repo",
    "v0.0.32-nightly.20260730.957",
    sha,
  );
  assert.equal(calls.length, 1);
});

test("selects the newest valid processed marker and ignores unrelated refs", () => {
  assert.equal(
    processedTagFromRefs([
      { ref: "refs/tags/processed-nightly/v0.0.32-nightly.20260730.956" },
      { ref: "refs/tags/something-else" },
      { ref: "refs/tags/processed-nightly/v0.0.32-nightly.20260730.957" },
    ]),
    "v0.0.32-nightly.20260730.957",
  );
});

test("rejects malformed repository and nightly values", async () => {
  await assert.rejects(
    recordProcessed(async () => null, "owner", "main", sha),
    /repository/,
  );
});
