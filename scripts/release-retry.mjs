import { randomUUID, createHash } from "node:crypto";
import { GitHubApiError, isTransientGitHubError, retryGitHub } from "./github-api.mjs";

function mayHaveCommitted(error) {
  return isTransientGitHubError(error) ||
    (error instanceof GitHubApiError && error.status === 422);
}

async function recoveryRequest(api, ...args) {
  try {
    return await api(...args);
  } catch (error) {
    // Reads already have transport retries. If reconciliation remains
    // unavailable, do not let its failure replay an uncertain mutation.
    throw new Error("Could not reconcile GitHub publication", { cause: error });
  }
}

async function listAll(api, endpoint) {
  const result = [];
  for (let page = 1; ; page += 1) {
    const batch = await recoveryRequest(api, `${endpoint}?per_page=100&page=${page}`);
    result.push(...batch);
    if (batch.length < 100) return result;
  }
}

export async function createDraft(api, repository, payload, retryOptions) {
  // A per-invocation marker allows recovery of a committed POST without
  // adopting or deleting another invocation's draft.
  const marker = `<!-- nightly-publication:${randomUUID()} -->`;
  const body = JSON.stringify({ ...payload, body: `${payload.body}\n\n${marker}` });
  return retryGitHub(async () => {
    try {
      return await api(`/repos/${repository}/releases`, { method: "POST", body });
    } catch (error) {
      if (!mayHaveCommitted(error)) throw error;
      const releases = await listAll(api, `/repos/${repository}/releases`);
      const owned = releases.filter((release) =>
        release.draft === true && release.tag_name === payload.tag_name &&
        release.body?.includes(marker));
      if (owned.length === 1) return owned[0];
      if (owned.length > 1) throw new Error("Ambiguous publication draft ownership");
      throw error;
    }
  }, retryOptions);
}

export async function uploadAsset(api, repository, release, name, bytes, contentType, retryOptions) {
  const endpoint = `/repos/${repository}/releases/${release.id}`;
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  const url = `${release.upload_url.replace("{?name,label}", "")}?name=${encodeURIComponent(name)}`;
  return retryGitHub(async () => {
    try {
      return await api(url, {
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(bytes.byteLength),
        },
        body: bytes,
      });
    } catch (error) {
      if (!mayHaveCommitted(error)) throw error;
      const current = await recoveryRequest(api, endpoint);
      if (current.draft !== true) throw new Error("Upload recovery requires an owned draft");
      const assets = await listAll(api, `${endpoint}/assets`);
      const matches = assets.filter((asset) => asset.name === name);
      if (matches.length > 1) throw new Error(`Ambiguous release asset: ${name}`);
      const asset = matches[0];
      if (asset?.state === "uploaded") {
        if (asset.size === bytes.byteLength && asset.digest === digest) return asset;
        throw new Error(`Release asset integrity mismatch: ${name}`);
      }
      if (asset) {
        if (asset.state !== "starter") throw new Error(`Unexpected release asset state: ${name}`);
        // GitHub can leave an empty starter asset after a failed upload.
        // Only the draft created by this invocation is eligible for cleanup.
        await recoveryRequest(api, `/repos/${repository}/releases/assets/${asset.id}`, { method: "DELETE" });
      }
      if (error instanceof GitHubApiError && error.status === 422 && asset) {
        // The known incomplete duplicate was removed; retry the upload.
        throw new GitHubApiError("POST", url, 503, "Incomplete upload removed");
      }
      throw error;
    }
  }, retryOptions);
}

export async function publishDraft(api, repository, release, retryOptions) {
  const endpoint = `/repos/${repository}/releases/${release.id}`;
  return retryGitHub(async () => {
    try {
      return await api(endpoint, {
        method: "PATCH",
        body: JSON.stringify({ draft: false, prerelease: false, make_latest: "true" }),
      });
    } catch (error) {
      if (!isTransientGitHubError(error)) throw error;
      const current = await recoveryRequest(api, endpoint);
      if (current.id === release.id && current.draft === false && current.prerelease === false) {
        return current;
      }
      if (current.draft !== true) throw new Error("Unexpected release state after publication");
      throw error;
    }
  }, retryOptions);
}
