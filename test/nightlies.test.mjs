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
    "android-v0.0.29-nightly.20260727.922",
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

test("selects every missing nightly newer than the publication floor", () => {
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
        tag_name: "android-v0.0.29-nightly.20260727.920",
        body: "<!-- android-version-code: 1785168740 -->",
      },
    ],
  );
  assert.deepEqual(
    selected.map((item) => item.tag_name),
    [
      "v0.0.29-nightly.20260727.921",
      "v0.0.29-nightly.20260727.922",
    ],
  );
});
