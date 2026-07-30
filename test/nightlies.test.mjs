import test from "node:test";
import assert from "node:assert/strict";

import {
  androidVersionCode,
  androidVersionName,
  downstreamTag,
  isQualifyingNightly,
  latestNativeBase,
  selectCandidates,
} from "../scripts/nightlies.mjs";

const release = (tag, publishedAt, overrides = {}) => ({
  id: Math.floor(Math.random() * 100_000),
  tag_name: tag,
  published_at: publishedAt,
  draft: false,
  prerelease: true,
  ...overrides,
});

test("accepts only official nightly-shaped prereleases", () => {
  assert.equal(
    isQualifyingNightly(
      release(
        "v0.0.29-nightly.20260727.922",
        "2026-07-27T18:54:45Z",
      ),
    ),
    true,
  );
  assert.equal(
    isQualifyingNightly(
      release("v0.0.29", "2026-07-27T18:54:45Z"),
    ),
    false,
  );
  assert.equal(
    isQualifyingNightly(
      release(
        "v0.0.29-nightly.20260727.922",
        "2026-07-27T18:54:45Z",
        { draft: true },
      ),
    ),
    false,
  );
});

test("derives deterministic Android versions and downstream tags", () => {
  assert.equal(androidVersionCode("2026-07-27T18:54:45Z"), 1785178485);
  assert.equal(
    androidVersionName("v0.0.29-nightly.20260727.922"),
    "0.0.29-nightly.20260727.922",
  );
  assert.equal(
    downstreamTag("v0.0.29-nightly.20260727.922"),
    "0.0.29-nightly.20260727.922",
  );
  assert.equal(
    downstreamTag("v0.0.29-nightly.20260727.922"),
    androidVersionName("v0.0.29-nightly.20260727.922"),
  );
});

test("bootstraps only the newest upstream nightly", () => {
  const selected = selectCandidates(
    [
      release(
        "v0.0.29-nightly.20260727.921",
        "2026-07-27T16:25:48Z",
      ),
      release(
        "v0.0.29-nightly.20260727.922",
        "2026-07-27T18:54:45Z",
      ),
    ],
    [],
  );
  assert.deepEqual(
    selected.map((item) => item.tag_name),
    ["v0.0.29-nightly.20260727.922"],
  );
});

test("selects only the newest missing nightly above the publication floor", () => {
  const selected = selectCandidates(
    [
      release(
        "v0.0.29-nightly.20260727.921",
        "2026-07-27T16:25:48Z",
      ),
      release(
        "v0.0.29-nightly.20260727.922",
        "2026-07-27T18:54:45Z",
      ),
    ],
    [
      {
        tag_name: "0.0.29-nightly.20260727.920",
        body: "<!-- android-version-code: 1785168740 -->",
      },
    ],
  );
  assert.deepEqual(
    selected.map((item) => item.tag_name),
    ["v0.0.29-nightly.20260727.922"],
  );
});

test("ignores drafts when deriving the publication floor", () => {
  const selected = selectCandidates(
    [
      release(
        "v0.0.29-nightly.20260727.922",
        "2026-07-27T18:54:45Z",
      ),
    ],
    [
      {
        tag_name: "9.9.9-nightly.20990101.1",
        body: "<!-- android-version-code: 2100000000 -->",
        draft: true,
      },
    ],
  );
  assert.equal(selected[0].tag_name, "v0.0.29-nightly.20260727.922");
});

test("fails closed on a published companion without a version marker", () => {
  assert.throws(
    () =>
      selectCandidates(
        [
          release(
            "v0.0.29-nightly.20260727.922",
            "2026-07-27T18:54:45Z",
          ),
        ],
        [
          {
            tag_name: "0.0.29-nightly.20260727.921",
            body: "missing machine-readable marker",
            draft: false,
          },
        ],
      ),
    /missing its version marker/,
  );
});

test("same-second nightlies choose the higher sequence without wedging", () => {
  const selected = selectCandidates(
    [
      release(
        "v0.0.29-nightly.20260727.922",
        "2026-07-27T18:54:45Z",
      ),
      release(
        "v0.0.29-nightly.20260727.921",
        "2026-07-27T18:54:45Z",
      ),
    ],
    [
      {
        tag_name: "0.0.29-nightly.20260727.920",
        body: "<!-- android-version-code: 1785168740 -->",
        draft: false,
      },
    ],
  );
  assert.equal(selected[0].tag_name, "v0.0.29-nightly.20260727.922");
});

test("processed OTA state advances selection beyond the latest APK", () => {
  const upstream = [
    release("v0.0.32-nightly.20260730.956", "2026-07-30T12:58:58Z"),
    release("v0.0.32-nightly.20260730.957", "2026-07-30T15:57:46Z"),
  ];
  const selected = selectCandidates(upstream, [], {
    processedTag: "v0.0.32-nightly.20260730.956",
  });
  assert.deepEqual(
    selected.map((item) => item.tag_name),
    ["v0.0.32-nightly.20260730.957"],
  );
});

test("processed state remains valid when its release has aged out of the fetch window", () => {
  assert.deepEqual(
    selectCandidates(
      [release("v0.0.32-nightly.20260730.957", "2026-07-30T15:57:46Z")],
      [],
      { processedTag: "v0.0.31-nightly.20260729.950" },
    ).map((item) => item.tag_name),
    ["v0.0.32-nightly.20260730.957"],
  );
});

test("extracts the newest OTA-enabled native base from release markers", () => {
  const base = latestNativeBase([
    {
      tag_name: "0.0.32-nightly.20260730.956",
      draft: false,
      body: `<!-- android-version-code: 1785425938 -->
<!-- native-fingerprint: ${"5".repeat(40)} -->
<!-- expo-project-id: 11111111-2222-4333-8444-555555555555 -->
<!-- expo-update-channel: nightly -->
<!-- expo-updates-enabled: true -->`,
    },
  ]);
  assert.deepEqual(base, {
    version_code: 1785425938,
    version_name: "0.0.32-nightly.20260730.956",
    native_fingerprint: "5".repeat(40),
    expo_project_id: "11111111-2222-4333-8444-555555555555",
    expo_update_channel: "nightly",
  });
});

test("legacy APK releases do not masquerade as OTA-enabled bases", () => {
  assert.equal(
    latestNativeBase([
      {
        tag_name: "0.0.32-nightly.20260730.956",
        draft: false,
        body: "<!-- android-version-code: 1785425938 -->",
      },
    ]),
    null,
  );
});
