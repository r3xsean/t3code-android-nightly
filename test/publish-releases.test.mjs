import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { GitHubApiError } from "../scripts/github-api.mjs";
import {
  EXPECTED_CERTIFICATE_SHA256,
  publishOne,
} from "../scripts/publish-releases.mjs";

const item = {
  upstream_tag: "v0.0.29-nightly.20260727.922",
  upstream_release_id: 360641809,
  upstream_sha: "80ead5f3a7743010cdab6ad84fa4dcbd4c021038",
  upstream_published_at: "2026-07-27T18:54:45Z",
  version_code: 1785178485,
  version_name: "0.0.29-nightly.20260727.922",
};

async function artifacts() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "t3code-publish-test-"),
  );
  const prefix = `t3code-nightly-${item.version_name}`;
  const apkBytes = Buffer.from("apk");
  const apkSha256 = createHash("sha256").update(apkBytes).digest("hex");
  await writeFile(path.join(directory, `${prefix}.apk`), apkBytes);
  await writeFile(
    path.join(directory, `${prefix}.apk.sha256`),
    `${apkSha256}  ${prefix}.apk\n`,
  );
  await writeFile(
    path.join(directory, `${prefix}.json`),
    JSON.stringify({
      upstream_tag: item.upstream_tag,
      upstream_release_id: item.upstream_release_id,
      upstream_published_at: item.upstream_published_at,
      upstream_sha: item.upstream_sha,
      version_code: item.version_code,
      version_name: item.version_name,
      package_id: "dev.r3xsean.t3code.nightly",
      certificate_sha256: EXPECTED_CERTIFICATE_SHA256,
      apk_sha256: apkSha256,
    }),
  );
  return directory;
}

test("treats an existing public release as an idempotent success", async () => {
  const calls = [];
  const api = async (url, options = {}) => {
    calls.push([url, options.method ?? "GET"]);
    return { id: 7, draft: false };
  };

  const result = await publishOne(api, "owner/repo", "/unused", item);
  assert.equal(result.status, "already-published");
  assert.deepEqual(calls, [
    [
      "/repos/owner/repo/releases/tags/android-v0.0.29-nightly.20260727.922",
      "GET",
    ],
  ]);
});

test("refuses artifact bytes that do not match signed metadata", async () => {
  const directory = await artifacts();
  const apk = path.join(
    directory,
    `t3code-nightly-${item.version_name}.apk`,
  );
  await writeFile(apk, "tampered");
  const api = async (url) => {
    if (url.includes("/releases/tags/")) {
      throw new GitHubApiError("GET", url, 404, "not found");
    }
    throw new Error("publication must not begin");
  };
  await assert.rejects(
    publishOne(api, "owner/repo", directory, item),
    /Artifact provenance mismatch/,
  );
});

test("upload failure removes only the draft created by this invocation", async () => {
  const directory = await artifacts();
  const calls = [];
  let uploadCount = 0;
  const api = async (url, options = {}) => {
    const method = options.method ?? "GET";
    calls.push([url, method]);
    if (url.includes("/releases/tags/")) {
      throw new GitHubApiError("GET", url, 404, "not found");
    }
    if (url === "/repos/owner/repo/releases" && method === "POST") {
      return {
        id: 42,
        draft: true,
        upload_url:
          "https://uploads.github.com/repos/owner/repo/releases/42/assets{?name,label}",
      };
    }
    if (url.startsWith("https://uploads.github.com/")) {
      uploadCount += 1;
      if (uploadCount === 2) {
        throw new Error("upload failed");
      }
      return {};
    }
    if (url === "/repos/owner/repo/releases/42" && method === "GET") {
      return { id: 42, draft: true };
    }
    if (url === "/repos/owner/repo/releases/42" && method === "DELETE") {
      return null;
    }
    throw new Error(`Unexpected API call: ${method} ${url}`);
  };

  await assert.rejects(
    publishOne(api, "owner/repo", directory, item),
    /upload failed/,
  );
  assert.ok(
    calls.some(
      ([url, method]) =>
        url === "/repos/owner/repo/releases/42" && method === "DELETE",
    ),
  );
  assert.equal(
    calls.some(([url]) => url.includes("/git/refs/tags/")),
    false,
  );
});

test("never deletes a release that became public after a lost response", async () => {
  const directory = await artifacts();
  const calls = [];
  const api = async (url, options = {}) => {
    const method = options.method ?? "GET";
    calls.push([url, method]);
    if (url.includes("/releases/tags/")) {
      throw new GitHubApiError("GET", url, 404, "not found");
    }
    if (url === "/repos/owner/repo/releases" && method === "POST") {
      return {
        id: 43,
        draft: true,
        upload_url:
          "https://uploads.github.com/repos/owner/repo/releases/43/assets{?name,label}",
      };
    }
    if (url.startsWith("https://uploads.github.com/")) {
      return {};
    }
    if (url === "/repos/owner/repo/releases/43" && method === "PATCH") {
      throw new Error("response lost");
    }
    if (url === "/repos/owner/repo/releases/43" && method === "GET") {
      return { id: 43, draft: false };
    }
    throw new Error(`Unexpected API call: ${method} ${url}`);
  };

  await assert.rejects(
    publishOne(api, "owner/repo", directory, item),
    /response lost/,
  );
  assert.equal(
    calls.some(
      ([url, method]) =>
        url === "/repos/owner/repo/releases/43" && method === "DELETE",
    ),
    false,
  );
});
