import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanupRunArtifacts,
  isTemporaryBuildArtifact,
} from "../scripts/cleanup-run-artifacts.mjs";

test("recognizes only the builder's temporary artifact names", () => {
  assert.equal(isTemporaryBuildArtifact("unsigned-v0.0.29-nightly.925"), true);
  assert.equal(isTemporaryBuildArtifact("companion-v0.0.29-nightly.925"), true);
  assert.equal(isTemporaryBuildArtifact("ota-v0.0.29-nightly.925"), true);
  assert.equal(isTemporaryBuildArtifact("release-apk"), false);
  assert.equal(isTemporaryBuildArtifact(undefined), false);
});

test("deletes only temporary artifacts from the current run", async () => {
  const requests = [];
  const messages = [];
  const api = async (path, options = {}) => {
    requests.push([path, options.method ?? "GET"]);
    if ((options.method ?? "GET") === "GET") {
      return {
        total_count: 4,
        artifacts: [
          { id: 101, name: "unsigned-v0.0.29-nightly.925" },
          { id: 102, name: "companion-v0.0.29-nightly.925" },
          { id: 104, name: "ota-v0.0.29-nightly.925" },
          { id: 103, name: "unrelated-diagnostic" },
        ],
      };
    }
    return null;
  };

  const deleted = await cleanupRunArtifacts({
    api,
    repository: "r3xsean/t3code-android-nightly",
    runId: "30309537373",
    log: (message) => messages.push(message),
  });

  assert.deepEqual(deleted, [
    "unsigned-v0.0.29-nightly.925",
    "companion-v0.0.29-nightly.925",
    "ota-v0.0.29-nightly.925",
  ]);
  assert.deepEqual(requests, [
    [
      "/repos/r3xsean/t3code-android-nightly/actions/runs/30309537373/artifacts?per_page=100",
      "GET",
    ],
    [
      "/repos/r3xsean/t3code-android-nightly/actions/artifacts/101",
      "DELETE",
    ],
    [
      "/repos/r3xsean/t3code-android-nightly/actions/artifacts/102",
      "DELETE",
    ],
    [
      "/repos/r3xsean/t3code-android-nightly/actions/artifacts/104",
      "DELETE",
    ],
  ]);
  assert.equal(messages.length, 3);
});

test("fails closed if the current run artifact list is incomplete", async () => {
  await assert.rejects(
    cleanupRunArtifacts({
      api: async () => ({
        total_count: 101,
        artifacts: [{ id: 101, name: "unsigned-vnightly" }],
      }),
      repository: "r3xsean/t3code-android-nightly",
      runId: "42",
    }),
    /safely enumerate every artifact/,
  );
});
