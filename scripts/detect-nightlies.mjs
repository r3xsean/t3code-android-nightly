import { appendFile } from "node:fs/promises";

import { githubApi } from "./github-api.mjs";
import {
  UPSTREAM_REPOSITORY,
  androidVersionName,
  resolveCommitSha,
  selectCandidates,
} from "./nightlies.mjs";

export async function detect({
  token,
  downstreamRepository,
  requestedTag,
}) {
  if (!downstreamRepository?.includes("/")) {
    throw new Error("GITHUB_REPOSITORY must be owner/name");
  }

  const api = githubApi(token);
  const upstream = await api(
    `/repos/${UPSTREAM_REPOSITORY}/releases?per_page=50`,
  );
  const downstream = await api(
    `/repos/${downstreamRepository}/releases?per_page=100`,
  );

  let candidates = selectCandidates(upstream, downstream);
  if (requestedTag) {
    const requested = upstream.find(
      (release) => release.tag_name === requestedTag,
    );
    if (!requested) {
      throw new Error(
        `Requested tag is not among the latest upstream releases: ${requestedTag}`,
      );
    }
    candidates = selectCandidates([requested], downstream);
  }

  const matrix = [];
  for (const release of candidates) {
    matrix.push({
      upstream_tag: release.tag_name,
      upstream_release_id: release.id,
      upstream_published_at: release.published_at,
      upstream_sha: await resolveCommitSha(api, release.tag_name),
      version_code: release.version_code,
      version_name: androidVersionName(release.tag_name),
    });
  }

  return matrix;
}

async function main() {
  const matrix = await detect({
    token: process.env.GITHUB_TOKEN,
    downstreamRepository: process.env.GITHUB_REPOSITORY,
    requestedTag: process.env.REQUESTED_UPSTREAM_TAG || undefined,
  });

  const output = JSON.stringify({ include: matrix });
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `matrix=${output}\nhas_releases=${matrix.length > 0}\n`,
    );
  } else {
    process.stdout.write(`${output}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
