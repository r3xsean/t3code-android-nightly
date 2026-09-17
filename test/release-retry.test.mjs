import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { GitHubApiError } from "../scripts/github-api.mjs";
import { createDraft, uploadAsset, publishDraft } from "../scripts/release-retry.mjs";

const retryOptions = { wait: async () => {} };
const timeout = () => new TypeError("fetch failed", {
  cause: Object.assign(new Error("Headers Timeout Error"), { code: "UND_ERR_HEADERS_TIMEOUT" }),
});
const release = { id: 42, draft: true, upload_url: "https://uploads.github.com/releases/42/assets{?name,label}" };
const bytes = Buffer.from("verified apk");
const asset = {
  id: 9, name: "nightly.apk", state: "uploaded", size: bytes.length,
  digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
};
const upload = (api) => uploadAsset(api, "owner/repo", release, asset.name, bytes, "application/vnd.android.package-archive", retryOptions);

test("recovers draft creation after a lost response without creating a second draft", async () => {
  let posts = 0;
  let created;
  const result = await createDraft(async (_url, options = {}) => {
    if (options.method === "POST") {
      posts++;
      created = { ...release, ...JSON.parse(options.body) };
      throw timeout();
    }
    return [{ ...created, id: 8, body: "someone else's draft" }, created];
  }, "owner/repo", { tag_name: "nightly", draft: true, body: "Provenance" }, retryOptions);
  assert.equal(result.id, 42);
  assert.equal(posts, 1);
});

test("retries an uncommitted draft creation only after checking existing drafts", async () => {
  const methods = [];
  const result = await createDraft(async (_url, options = {}) => {
    methods.push(options.method ?? "GET");
    if (!options.method) return [];
    if (methods.length === 1) throw timeout();
    return release;
  }, "owner/repo", { tag_name: "nightly", body: "Provenance" }, retryOptions);
  assert.equal(result.id, 42);
  assert.deepEqual(methods, ["POST", "GET", "POST"]);
});

test("does not repeat uncertain writes when reconciliation is unavailable", async () => {
  for (const operation of [
    (api) => createDraft(api, "owner/repo", { tag_name: "nightly", body: "Provenance" }, retryOptions),
    upload,
    (api) => publishDraft(api, "owner/repo", release, retryOptions),
  ]) {
    let writes = 0;
    await assert.rejects(operation(async (_url, options = {}) => {
      if (options.method) writes++;
      throw timeout();
    }), /Could not reconcile/);
    assert.equal(writes, 1);
  }
});

test("a completed upload with a lost response is accepted only by size and SHA-256", async () => {
  for (const candidate of [asset, { ...asset, digest: "sha256:wrong" }, { ...asset, size: 1 }, { ...asset, digest: null }]) {
    let posts = 0;
    const operation = upload(async (url, options = {}) => {
      if (options.method === "POST") { posts++; throw timeout(); }
      return url.includes("/assets?") ? [candidate] : release;
    });
    if (candidate === asset) assert.equal((await operation).id, 9);
    else await assert.rejects(operation, /integrity mismatch/);
    assert.equal(posts, 1);
  }
});

test("removes an incomplete starter on the owned draft before retrying identical bytes", async () => {
  const methods = [];
  const bodies = [];
  let removed = false;
  const result = await upload(async (url, options = {}) => {
    methods.push(options.method ?? "GET");
    if (options.method === "POST") {
      bodies.push(Buffer.from(options.body));
      if (removed) return asset;
      throw new GitHubApiError("POST", url, 502, "bad gateway");
    }
    if (options.method === "DELETE") { removed = true; return null; }
    return url.includes("/assets?") ? [{ ...asset, state: "starter", size: 0 }] : release;
  });
  assert.equal(result.id, 9);
  assert.deepEqual(methods, ["POST", "GET", "GET", "DELETE", "POST"]);
  assert.deepEqual(bodies, [bytes, bytes]);
});

test("reconciles duplicate asset responses and fails closed on a public release", async () => {
  let writes = 0;
  const api = (draft) => async (url, options = {}) => {
    if (options.method) { writes++; throw new GitHubApiError("POST", url, 422, "already_exists"); }
    return url.includes("/assets?") ? [asset] : { ...release, draft };
  };
  assert.equal((await upload(api(true))).id, 9);
  await assert.rejects(upload(api(false)), /owned draft/);
  assert.equal(writes, 2);
});

test("persistent upload outages are bounded and never promote a draft", async () => {
  let posts = 0;
  await assert.rejects(upload(async (url, options = {}) => {
    if (options.method === "POST") { posts++; throw timeout(); }
    assert.equal(options.method, undefined);
    return url.includes("/assets?") ? [] : release;
  }), /fetch failed/);
  assert.equal(posts, 3);
});

test("a lost promotion response is recovered without deleting the public release", async () => {
  let patches = 0;
  const result = await publishDraft(async (_url, options = {}) => {
    if (options.method === "PATCH") { patches++; throw timeout(); }
    assert.equal(options.method, undefined);
    return { ...release, draft: false, prerelease: false };
  }, "owner/repo", release, retryOptions);
  assert.equal(result.draft, false);
  assert.equal(patches, 1);
});

test("retries promotion when reconciliation proves the release remains a draft", async () => {
  let patches = 0;
  const result = await publishDraft(async (_url, options = {}) => {
    if (options.method === "PATCH") {
      if (++patches === 1) throw timeout();
      return { ...release, draft: false, prerelease: false };
    }
    return release;
  }, "owner/repo", release, retryOptions);
  assert.equal(result.draft, false);
  assert.equal(patches, 2);
});
