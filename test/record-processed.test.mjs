import test from "node:test";
import assert from "node:assert/strict";

import { GitHubApiError } from "../scripts/github-api.mjs";
import { recordProcessed } from "../scripts/record-processed.mjs";

test("updates the durable processed tag only through the repository variable endpoint", async () => {
  const calls = [];
  const api = async (path, options) => {
    calls.push([path, options]);
    return null;
  };
  await recordProcessed(
    api,
    "owner/repo",
    "v0.0.32-nightly.20260730.957",
  );
  assert.equal(
    calls[0][0],
    "/repos/owner/repo/actions/variables/LAST_PROCESSED_UPSTREAM_TAG",
  );
  assert.equal(calls[0][1].method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    name: "LAST_PROCESSED_UPSTREAM_TAG",
    value: "v0.0.32-nightly.20260730.957",
  });
});

test("creates the variable only when the update endpoint reports missing", async () => {
  const calls = [];
  const api = async (path, options) => {
    calls.push([path, options]);
    if (options.method === "PATCH") {
      throw new GitHubApiError("PATCH", path, 404, "missing");
    }
    return null;
  };
  await recordProcessed(
    api,
    "owner/repo",
    "v0.0.32-nightly.20260730.957",
  );
  assert.equal(calls[1][0], "/repos/owner/repo/actions/variables");
  assert.equal(calls[1][1].method, "POST");
});

test("rejects malformed repository and nightly values", async () => {
  await assert.rejects(
    recordProcessed(async () => null, "owner", "main"),
    /repository/,
  );
});
