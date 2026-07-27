import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { githubApi } from "./github-api.mjs";
import { downstreamTag } from "./nightlies.mjs";
import { releaseBody } from "./release-body.mjs";

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

async function removePartial(api, repository, releaseId, tag) {
  if (releaseId) {
    await api(`/repos/${repository}/releases/${releaseId}`, {
      method: "DELETE",
    }).catch(() => {});
  }
  await api(
    `/repos/${repository}/git/refs/tags/${encodeURIComponent(tag)}`,
    { method: "DELETE" },
  ).catch(() => {});
}

async function publishOne(api, repository, artifactsDirectory, item) {
  const tag = downstreamTag(item.upstream_tag);
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

  const metadataValue = JSON.parse(
    await readFile(path.join(artifactsDirectory, metadata), "utf8"),
  );
  if (
    metadataValue.upstream_sha !== item.upstream_sha ||
    metadataValue.version_code !== item.version_code
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
  } catch (error) {
    await removePartial(api, repository, release?.id, tag);
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
  const ordered = [...matrix.include].sort(
    (left, right) => left.version_code - right.version_code,
  );
  for (const item of ordered) {
    await publishOne(api, repository, artifactsDirectory, item);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
