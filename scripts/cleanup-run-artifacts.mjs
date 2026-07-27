import { GitHubApiError, githubApi } from "./github-api.mjs";

const TEMPORARY_ARTIFACT_PREFIXES = ["unsigned-v", "companion-v"];

export function isTemporaryBuildArtifact(name) {
  return (
    typeof name === "string" &&
    TEMPORARY_ARTIFACT_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

export async function cleanupRunArtifacts({
  api,
  repository,
  runId,
  log = console.log,
}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(`Invalid GITHUB_REPOSITORY: ${repository}`);
  }
  if (!/^\d+$/.test(String(runId))) {
    throw new Error(`Invalid GITHUB_RUN_ID: ${runId}`);
  }

  const runArtifacts = await api(
    `/repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`,
  );
  if (
    !Array.isArray(runArtifacts.artifacts) ||
    runArtifacts.total_count !== runArtifacts.artifacts.length
  ) {
    throw new Error(
      "Could not safely enumerate every artifact from the current workflow run",
    );
  }

  const temporaryArtifacts = runArtifacts.artifacts.filter((artifact) =>
    isTemporaryBuildArtifact(artifact.name),
  );
  for (const artifact of temporaryArtifacts) {
    if (!Number.isSafeInteger(artifact.id) || artifact.id < 1) {
      throw new Error(`Invalid artifact ID for ${artifact.name}`);
    }
    try {
      await api(`/repos/${repository}/actions/artifacts/${artifact.id}`, {
        method: "DELETE",
      });
      log(`Deleted temporary Actions artifact: ${artifact.name}`);
    } catch (error) {
      if (!(error instanceof GitHubApiError && error.status === 404)) {
        throw error;
      }
      log(`Temporary Actions artifact was already deleted: ${artifact.name}`);
    }
  }

  if (temporaryArtifacts.length === 0) {
    log("No temporary Actions artifacts remain for this workflow run");
  }
  return temporaryArtifacts.map((artifact) => artifact.name);
}

async function main() {
  const api = githubApi(process.env.GITHUB_TOKEN);
  await cleanupRunArtifacts({
    api,
    repository: process.env.GITHUB_REPOSITORY ?? "",
    runId: process.env.GITHUB_RUN_ID ?? "",
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
