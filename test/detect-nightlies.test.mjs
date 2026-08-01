import test from "node:test";
import assert from "node:assert/strict";

import { detect } from "../scripts/detect-nightlies.mjs";

const previous = {
  id: 956,
  tag_name: "v0.0.32-nightly.20260730.956",
  published_at: "2026-07-30T12:58:58Z",
  draft: false,
  prerelease: true,
};
const latest = {
  id: 957,
  tag_name: "v0.0.32-nightly.20260730.957",
  published_at: "2026-07-30T15:57:46Z",
  draft: false,
  prerelease: true,
};

test("detection carries the OTA-enabled native base into the immutable matrix", async (t) => {
  const fingerprint = "5".repeat(40);
  t.mock.method(globalThis, "fetch", async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname === "/repos/pingdotgg/t3code/releases") {
      return Response.json([latest, previous]);
    }
    if (pathname === "/repos/owner/repo/releases") {
      return Response.json([
        {
          tag_name: "0.0.32-nightly.20260730.956",
          draft: false,
          body: `<!-- android-version-code: 1785425938 -->
<!-- native-fingerprint: ${fingerprint} -->
<!-- expo-project-id: 11111111-2222-4333-8444-555555555555 -->
<!-- expo-update-channel: nightly -->
<!-- expo-updates-enabled: true -->`,
        },
      ]);
    }
    if (
      pathname ===
      "/repos/owner/repo/git/matching-refs/tags/processed-nightly/"
    ) {
      return Response.json([
        {
          ref: `refs/tags/processed-nightly/${previous.tag_name}`,
        },
      ]);
    }
    if (
      pathname ===
      "/repos/pingdotgg/t3code/git/ref/tags/v0.0.32-nightly.20260730.957"
    ) {
      return Response.json({
        object: {
          type: "commit",
          sha: "a".repeat(40),
        },
      });
    }
    return new Response("not found", { status: 404 });
  });

  const matrix = await detect({
    token: "token",
    downstreamRepository: "owner/repo",
  });
  assert.equal(matrix.length, 1);
  assert.equal(matrix[0].upstream_tag, latest.tag_name);
  assert.equal(matrix[0].upstream_sha, "a".repeat(40));
  assert.deepEqual(matrix[0].native_base, {
    version_code: 1785425938,
    version_name: "0.0.32-nightly.20260730.956",
    native_fingerprint: fingerprint,
    expo_project_id: "11111111-2222-4333-8444-555555555555",
    expo_update_channel: "nightly",
  });
});

test("explicit native recovery can rebuild an already processed exact tag", async (t) => {
  const fingerprint = "5".repeat(40);
  t.mock.method(globalThis, "fetch", async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname === "/repos/pingdotgg/t3code/releases") {
      return Response.json([latest, previous]);
    }
    if (pathname === "/repos/owner/repo/releases") {
      return Response.json([
        {
          tag_name: "0.0.32-nightly.20260730.956",
          draft: false,
          body: `<!-- android-version-code: 1785425938 -->
<!-- native-fingerprint: ${fingerprint} -->
<!-- expo-project-id: 11111111-2222-4333-8444-555555555555 -->
<!-- expo-update-channel: nightly -->
<!-- expo-updates-enabled: true -->`,
        },
      ]);
    }
    if (
      pathname ===
      "/repos/owner/repo/git/matching-refs/tags/processed-nightly/"
    ) {
      return Response.json([
        {
          ref: `refs/tags/processed-nightly/${latest.tag_name}`,
        },
      ]);
    }
    if (
      pathname ===
      "/repos/pingdotgg/t3code/git/ref/tags/v0.0.32-nightly.20260730.957"
    ) {
      return Response.json({
        object: {
          type: "commit",
          sha: "b".repeat(40),
        },
      });
    }
    return new Response("not found", { status: 404 });
  });

  const matrix = await detect({
    token: "token",
    downstreamRepository: "owner/repo",
    requestedTag: latest.tag_name,
    forceNativeRecovery: true,
  });
  assert.equal(matrix.length, 1);
  assert.equal(matrix[0].upstream_tag, latest.tag_name);
  assert.equal(matrix[0].upstream_sha, "b".repeat(40));
});

test("native recovery refuses to select a mutable implicit latest tag", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith("/releases")) return Response.json([]);
    if (pathname.includes("/matching-refs/")) return Response.json([]);
    return new Response("not found", { status: 404 });
  });

  await assert.rejects(
    () =>
      detect({
        token: "token",
        downstreamRepository: "owner/repo",
        forceNativeRecovery: true,
      }),
    /requires an exact upstream tag/,
  );
});
