import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { githubApi } from "../scripts/github-api.mjs";
import { publishOne, EXPECTED_CERTIFICATE_SHA256 } from "../scripts/publish-releases.mjs";

const timeout = () => new TypeError("fetch failed", {
  cause: Object.assign(new Error("Headers Timeout Error"), { code: "UND_ERR_HEADERS_TIMEOUT" }),
});
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const retryOptions = { wait: async () => {} };

test("publication survives lost responses at every stage and exposes exactly three verified assets", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "nightly-recovery-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const item = {
    upstream_tag: "v0.0.43-nightly.20260917.1866",
    upstream_release_id: 390849801,
    upstream_published_at: "2026-09-17T15:43:08Z",
    upstream_sha: "d4d5d12e8ba086cfbf79ca3adeb4156b46ead665",
    version_code: 1789659788,
    version_name: "0.0.43-nightly.20260917.1866",
    native_fingerprint: "5f6ddfa695f75a22e8ee3392bacd239827fee089",
    expo_project_id: "f6933e31-cda6-4835-8f8d-93f4970ff60f",
    expo_update_channel: "nightly",
  };
  const apk = Buffer.from("signed APK fixture");
  const name = `t3code-nightly-${item.version_name}`;
  const metadata = {
    ...item, package_id: "dev.r3xsean.t3code.nightly", abi: "arm64-v8a",
    certificate_sha256: EXPECTED_CERTIFICATE_SHA256, apk_sha256: digest(apk),
    expo_updates_enabled: true,
  };
  const artifacts = new Map([
    [`${name}.apk`, apk],
    [`${name}.apk.sha256`, Buffer.from(`${digest(apk)}  ${name}.apk\n`)],
    [`${name}.json`, Buffer.from(JSON.stringify(metadata))],
  ]);
  for (const [file, content] of artifacts) await writeFile(path.join(directory, file), content);
  let release;
  let lookupCalls = 0;
  let creates = 0;
  let uploads = 0;
  let promotions = 0;
  const assets = [];
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    const parsed = new URL(url);
    const method = options.method ?? "GET";
    if (parsed.pathname.includes("/releases/tags/")) {
      if (++lookupCalls === 1) throw timeout();
      return new Response("not found", { status: 404 });
    }
    if (parsed.pathname === "/repos/owner/repo/releases") {
      if (method === "GET") return Response.json([release]);
      assert.equal(method, "POST");
      creates++;
      release = { ...JSON.parse(options.body), id: 42,
        upload_url: "https://uploads.github.com/repos/owner/repo/releases/42/assets{?name,label}" };
      throw timeout();
    }
    if (parsed.pathname.endsWith("/assets")) {
      if (method === "GET") return Response.json(assets);
      assert.equal(method, "POST");
      assert.equal(release.draft, true);
      const assetName = parsed.searchParams.get("name");
      assert.deepEqual(options.body, artifacts.get(assetName));
      assets.push({ id: ++uploads, name: assetName, state: "uploaded",
        size: options.body.length, digest: `sha256:${digest(options.body)}` });
      throw timeout();
    }
    assert.equal(parsed.pathname, "/repos/owner/repo/releases/42");
    if (method === "GET") return Response.json(release);
    assert.equal(method, "PATCH");
    assert.equal(assets.length, 3);
    promotions++;
    Object.assign(release, JSON.parse(options.body));
    throw timeout();
  });
  const result = await publishOne(githubApi("test-token", retryOptions), "owner/repo", directory, item, retryOptions);
  assert.equal(result.status, "published");
  assert.equal(result.release.draft, false);
  assert.equal(result.release.make_latest, "true");
  assert.deepEqual([lookupCalls, creates, uploads, promotions], [2, 1, 3, 1]);
  assert.deepEqual(assets.map((asset) => asset.name), [...artifacts.keys()]);
});

test("a draft returned by a tag lookup is never reported as a delivered APK", async () => {
  await assert.rejects(publishOne(async () => ({ id: 42, draft: true }), "owner/repo", "/unused", {
    upstream_tag: "v0.0.43-nightly.20260917.1866",
  }), /not public/);
});
