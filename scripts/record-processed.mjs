import { GitHubApiError, githubApi } from "./github-api.mjs";

const VARIABLE = "LAST_PROCESSED_UPSTREAM_TAG";
const NIGHTLY = /^v\d+\.\d+\.\d+-nightly\.\d{8}\.\d+$/;

export async function recordProcessed(api, repository, tag) {
  if (!/^[^/]+\/[^/]+$/.test(repository ?? "")) {
    throw new Error("GITHUB_REPOSITORY must be an owner/name repository");
  }
  if (!NIGHTLY.test(tag ?? "")) {
    throw new Error(`Invalid processed nightly tag: ${tag}`);
  }

  const body = JSON.stringify({ name: VARIABLE, value: tag });
  try {
    await api(
      `/repos/${repository}/actions/variables/${VARIABLE}`,
      {
        method: "PATCH",
        body,
      },
    );
  } catch (error) {
    if (!(error instanceof GitHubApiError) || error.status !== 404) {
      throw error;
    }
    await api(`/repos/${repository}/actions/variables`, {
      method: "POST",
      body,
    });
  }
}

async function main() {
  await recordProcessed(
    githubApi(process.env.GITHUB_TOKEN),
    process.env.GITHUB_REPOSITORY,
    process.env.UPSTREAM_TAG,
  );
  console.log(`Recorded ${process.env.UPSTREAM_TAG}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
