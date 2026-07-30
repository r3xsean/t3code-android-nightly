import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  dispatchDecision,
  MAX_RETRY_ATTEMPTS,
  readState,
  retryDelayMilliseconds,
  writeState,
} from "../scripts/dispatch-nightly.mjs";

test("dispatches a newer upstream nightly exactly once", () => {
  assert.deepEqual(
    dispatchDecision({
      latestUpstreamTag: "v0.0.32-nightly.20260730.957",
      processedTag: "v0.0.32-nightly.20260730.956",
      activeTags: [],
      retryState: null,
      now: Date.parse("2026-07-30T16:00:00Z"),
    }),
    { action: "dispatch", tag: "v0.0.32-nightly.20260730.957" },
  );
});

test("does nothing when processed or already active", () => {
  assert.equal(
    dispatchDecision({
      latestUpstreamTag: "v0.0.32-nightly.20260730.957",
      processedTag: "v0.0.32-nightly.20260730.957",
      activeTags: [],
      retryState: null,
      now: 1,
    }).action,
    "current",
  );
  assert.equal(
    dispatchDecision({
      latestUpstreamTag: "v0.0.32-nightly.20260730.957",
      processedTag: "v0.0.32-nightly.20260730.956",
      activeTags: ["v0.0.32-nightly.20260730.957"],
      retryState: null,
      now: 1,
    }).action,
    "active",
  );
});

test("honors retry state and caps exponential backoff at thirty minutes", () => {
  assert.equal(retryDelayMilliseconds(1), 60_000);
  assert.equal(retryDelayMilliseconds(8), 1_800_000);
  assert.equal(
    dispatchDecision({
      latestUpstreamTag: "v0.0.32-nightly.20260730.957",
      processedTag: "v0.0.32-nightly.20260730.956",
      activeTags: [],
      retryState: {
        tag: "v0.0.32-nightly.20260730.957",
        attempt: 2,
        retryAfter: 10_000,
      },
      now: 9_999,
    }).action,
    "backoff",
  );
});

test("stops redispatching a failed nightly after a bounded number of attempts", () => {
  assert.equal(
    dispatchDecision({
      latestUpstreamTag: "v0.0.32-nightly.20260730.957",
      processedTag: "v0.0.32-nightly.20260730.956",
      activeTags: [],
      retryState: {
        tag: "v0.0.32-nightly.20260730.957",
        attempt: MAX_RETRY_ATTEMPTS,
        retryAfter: 0,
      },
      now: 1,
    }).action,
    "exhausted",
  );
});

test("fails closed on malformed tags", () => {
  assert.throws(
    () =>
      dispatchDecision({
        latestUpstreamTag: "main",
        processedTag: "",
        activeTags: [],
        retryState: null,
        now: 1,
      }),
    /nightly tag/,
  );
});

test("writes retry state atomically and quarantines a corrupt state file", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "t3-dispatcher-"));
  const statePath = path.join(directory, "dispatcher-state.json");
  try {
    const state = {
      tag: "v0.0.32-nightly.20260730.957",
      attempt: 1,
      retryAfter: 10_000,
    };
    await writeState(statePath, state);
    assert.deepEqual(await readState(statePath), state);

    await writeFile(statePath, "{truncated", { mode: 0o600 });
    assert.equal(await readState(statePath), null);
    assert.equal(
      (await readdir(directory)).some((name) =>
        name.startsWith("dispatcher-state.json.corrupt-"),
      ),
      true,
    );
    await assert.rejects(readFile(statePath), /ENOENT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
