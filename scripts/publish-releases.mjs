import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

import { GitHubApiError, githubApi } from "./github-api.mjs";
import { downstreamTag } from "./nightlies.mjs";
import { releaseBody } from "./release-body.mjs";

export const EXPECTED_CERTIFICATE_SHA256 =
  "3EAAE08EE4FA2F8A2D2A85FE359840267F6E022B1963C19A60768D96EE40578B";

async function upload(api, uploadUrl, assetPath, contentType) {
  const bytes = await readFile(assetPath);
  const name = path.basename(assetPath);
  await api(
    `${uploadUrl.replace("{?name,label}", "")}?name=${encodeURIComponent(name)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.byteLength),
      },
      body: bytes,
    },
  );
}

async function findPublishedRelease(api, repository, tag) {
  try {
    return await api(
      `/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`,
    );
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

async function removeOwnedDraft(api, repository, releaseId) {
  if (!releaseId) {
    return;
  }
  try {
    const current = await api(`/repos/${repository}/releases/${releaseId}`);
    if (current.draft === true) {
      await api(`/repos/${repository}/releases/${releaseId}`, {
        method: "DELETE",
      });
    }
  } catch (error) {
    // Cleanup is best-effort and must never delete a release whose current
    // public/draft state could not be confirmed.
    console.error(`Could not clean up draft release ${releaseId}:`, error);
  }
}

export async function publishOne(
  api,
  repository,
  artifactsDirectory,
  item,
) {
  const tag = downstreamTag(item.upstream_tag);
  const existing = await findPublishedRelease(api, repository, tag);
  if (existing) {
    return { status: "already-published", release: existing };
  }

  const expectedPrefix = `t3code-nightly-${item.upstream_tag.slice(1)}`;
  const files = await readdir(artifactsDirectory);
  const apk = files.find((file) => file === `${expectedPrefix}.apk`);
  const checksum = files.find(
    (file) => file === `${expectedPrefix}.apk.sha256`,
  );
  const metadata = files.find((file) => file === `${expectedPrefix}.json`);
  if (!apk || !checksum || !metadata) {
    throw new Error(`Missing publication artifacts for ${item.upstream_tag}`);
  }

  const apkBytes = await readFile(path.join(artifactsDirectory, apk));
  const checksumValue = await readFile(
    path.join(artifactsDirectory, checksum),
    "utf8",
  );
  const metadataValue = JSON.parse(
    await readFile(path.join(artifactsDirectory, metadata), "utf8"),
  );
  const apkSha256 = createHash("sha256").update(apkBytes).digest("hex");
  const expectedChecksumLine = `${apkSha256}  ${apk}`;
  if (
    metadataValue.upstream_tag !== item.upstream_tag ||
    metadataValue.upstream_release_id !== item.upstream_release_id ||
    metadataValue.upstream_published_at !== item.upstream_published_at ||
    metadataValue.upstream_sha !== item.upstream_sha ||
    metadataValue.version_code !== item.version_code ||
    metadataValue.version_name !== item.version_name ||
    metadataValue.package_id !== "dev.r3xsean.t3code.nightly" ||
    metadataValue.abi !== "arm64-v8a" ||
    metadataValue.certificate_sha256 !== EXPECTED_CERTIFICATE_SHA256 ||
    metadataValue.apk_sha256 !== apkSha256 ||
    metadataValue.native_fingerprint !== item.native_fingerprint ||
    metadataValue.expo_project_id !== item.expo_project_id ||
    metadataValue.expo_update_channel !== item.expo_update_channel ||
    metadataValue.expo_updates_enabled !== true ||
    checksumValue.trim() !== expectedChecksumLine
  ) {
    throw new Error(`Artifact provenance mismatch for ${item.upstream_tag}`);
  }

  let release;
  try {
    release = await api(`/repos/${repository}/releases`, {
      method: "POST",
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: process.env.GITHUB_SHA,
        name: `T3 Code Android ${item.upstream_tag}`,
        body: releaseBody(item, metadataValue.certificate_sha256),
        draft: true,
        prerelease: false,
      }),
    });

    await upload(
      api,
      release.upload_url,
      path.join(artifactsDirectory, apk),
      "application/vnd.android.package-archive",
    );
    await upload(
      api,
      release.upload_url,
      path.join(artifactsDirectory, checksum),
      "text/plain",
    );
    await upload(
      api,
      release.upload_url,
      path.join(artifactsDirectory, metadata),
      "application/json",
    );

    await api(`/repos/${repository}/releases/${release.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        draft: false,
        prerelease: false,
        make_latest: "true",
      }),
    });
    return { status: "published", release };
  } catch (error) {
    await removeOwnedDraft(api, repository, release?.id);
    throw error;
  }
}

async function main() {
  const matrix = JSON.parse(process.env.RELEASE_MATRIX ?? '{"include":[]}');
  const repository = process.env.GITHUB_REPOSITORY;
  const artifactsDirectory = process.env.ARTIFACTS_DIRECTORY;
  if (!repository || !artifactsDirectory) {
    throw new Error("GITHUB_REPOSITORY and ARTIFACTS_DIRECTORY are required");
  }

  const api = githubApi(process.env.GITHUB_TOKEN);
  const ordered = matrix.include.map((item) => ({
    ...item,
    native_fingerprint: process.env.NATIVE_FINGERPRINT,
    expo_project_id: process.env.EXPO_PROJECT_ID,
    expo_update_channel: process.env.EXPO_UPDATE_CHANNEL,
  })).sort(
    (left, right) => left.version_code - right.version_code,
  );
  for (const item of ordered) {
    const result = await publishOne(
      api,
      repository,
      artifactsDirectory,
      item,
    );
    console.log(`${item.upstream_tag}: ${result.status}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
