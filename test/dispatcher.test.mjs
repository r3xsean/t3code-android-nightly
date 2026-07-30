import test from "node:test";
import assert from "node:assert/strict";

import {
  dispatchDecision,
  retryDelayMilliseconds,
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
