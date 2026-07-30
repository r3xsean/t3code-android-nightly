import { githubApi } from "./github-api.mjs";
import {
  processedRef,
  processedTagFromRefs,
} from "./processed-state.mjs";

export { processedTagFromRefs };

export async function recordProcessed(api, repository, tag, sha) {
  if (!/^[^/]+\/[^/]+$/.test(repository ?? "")) {
    throw new Error("GITHUB_REPOSITORY must be an owner/name repository");
  }
  const ref = processedRef(tag);
  if (!/^[0-9a-f]{40}$/.test(sha ?? "")) {
    throw new Error("GITHUB_SHA must be a 40-character lowercase commit SHA");
  }

  const suffix = ref.slice("refs/tags/".length);
  try {
    await api(`/repos/${repository}/git/ref/tags/${suffix}`);
    return;
  } catch (error) {
    if (error?.status !== 404) {
      throw error;
    }
  }

  await api(`/repos/${repository}/git/refs`, {
    method: "POST",
    body: JSON.stringify({
      ref,
      sha,
    }),
  });
}

export async function readProcessedTag(api, repository) {
  if (!/^[^/]+\/[^/]+$/.test(repository ?? "")) {
    throw new Error("repository must be owner/name");
  }
  return processedTagFromRefs(
    await api(`/repos/${repository}/git/matching-refs/tags/processed-nightly/`),
  );
}

async function main() {
  await recordProcessed(
    githubApi(process.env.GITHUB_TOKEN),
    process.env.GITHUB_REPOSITORY,
    process.env.UPSTREAM_TAG,
    process.env.GITHUB_SHA,
  );
  console.log(`Recorded ${process.env.UPSTREAM_TAG}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
