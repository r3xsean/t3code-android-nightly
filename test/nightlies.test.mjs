import test from "node:test";
import assert from "node:assert/strict";

import {
  androidVersionCode,
  androidVersionName,
  downstreamTag,
  isQualifyingNightly,
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
