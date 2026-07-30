import { execFile } from "node:child_process";
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  compareNightlyTags,
  NIGHTLY_PATTERN,
  processedTagFromRefs,
} from "./processed-state.mjs";

const execFileAsync = promisify(execFile);
const NIGHTLY = NIGHTLY_PATTERN;
const DEFAULT_REPOSITORY = "r3xsean/t3code-android-nightly";
const ALLOWED_GH_PATHS = new Set([
  "/opt/homebrew/bin/gh",
  "/usr/local/bin/gh",
]);
export const MAX_RETRY_ATTEMPTS = 3;

export function validateGhPath(ghPath) {
  if (!ALLOWED_GH_PATHS.has(ghPath)) {
    throw new Error("GH_PATH must be a trusted Homebrew gh installation");
  }
  return ghPath;
}

export function retryDelayMilliseconds(attempt) {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error("Retry attempt must be a positive integer");
  }
  return Math.min(30 * 60_000, 60_000 * 2 ** (attempt - 1));
}

export function dispatchDecision({
  latestUpstreamTag,
  processedTag,
  activeTags,
  retryState,
  now,
}) {
  compareNightlyTags(latestUpstreamTag, latestUpstreamTag);
  if (processedTag) {
    if (compareNightlyTags(latestUpstreamTag, processedTag) <= 0) {
      return { action: "current", tag: latestUpstreamTag };
    }
  }
  if (activeTags.includes(latestUpstreamTag)) {
    return { action: "active", tag: latestUpstreamTag };
  }
  if (
    retryState?.tag === latestUpstreamTag &&
    Number.isFinite(retryState.retryAfter) &&
    now < retryState.retryAfter
  ) {
    return {
      action: "backoff",
      tag: latestUpstreamTag,
      retryAfter: retryState.retryAfter,
    };
  }
  if (
    retryState?.tag === latestUpstreamTag &&
    retryState.attempt >= MAX_RETRY_ATTEMPTS
  ) {
    return { action: "exhausted", tag: latestUpstreamTag };
  }
  return { action: "dispatch", tag: latestUpstreamTag };
}

async function gh(ghPath, args) {
  const { stdout } = await execFileAsync(ghPath, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

export async function readState(statePath) {
  let contents;
  try {
    contents = await readFile(statePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  try {
    const state = JSON.parse(contents);
    if (
      typeof state?.tag !== "string" ||
      !Number.isInteger(state?.attempt) ||
      !Number.isFinite(state?.retryAfter)
    ) {
      throw new Error("invalid retry state");
    }
    return state;
  } catch (error) {
    const quarantined = `${statePath}.corrupt-${Date.now()}`;
    await rename(statePath, quarantined);
    return null;
  }
}

export async function writeState(statePath, state) {
  await mkdir(path.dirname(statePath), { recursive: true });
  const temporary = `${statePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, statePath);
}

async function main() {
  const repository = DEFAULT_REPOSITORY;
  const ghPath = validateGhPath(
    process.env.GH_PATH ?? "/opt/homebrew/bin/gh",
  );
  const stateDirectory =
    process.env.DISPATCHER_STATE_DIRECTORY ??
    path.join(
      process.env.HOME,
      "Library",
      "Application Support",
      "T3CodeNightly",
    );
  const statePath = path.join(stateDirectory, "dispatcher-state.json");

  const upstreamReleases = JSON.parse(
    await gh(ghPath, [
      "api",
      "repos/pingdotgg/t3code/releases?per_page=20",
    ]),
  );
  const latest = upstreamReleases.find(
    (release) =>
      release?.draft === false &&
      release?.prerelease === true &&
      NIGHTLY.test(release?.tag_name ?? ""),
  )?.tag_name;
  if (!latest) {
    throw new Error("No qualifying upstream nightly found");
  }

  const processedTag = processedTagFromRefs(
    JSON.parse(
      await gh(ghPath, [
        "api",
        `repos/${repository}/git/matching-refs/tags/processed-nightly/`,
      ]),
    ),
  );

  const runs = JSON.parse(
    await gh(ghPath, [
      "api",
      `repos/${repository}/actions/workflows/android-nightly.yml/runs?per_page=20`,
    ]),
  );
  const hasActiveRun = runs.workflow_runs?.some((run) =>
    ["queued", "in_progress", "waiting", "requested", "pending"].includes(
      run.status,
    ),
  );
  const retryState = await readState(statePath);
  const decision = dispatchDecision({
    latestUpstreamTag: latest,
    processedTag,
    activeTags: hasActiveRun ? [latest] : [],
    retryState,
    now: Date.now(),
  });
  if (decision.action !== "dispatch") {
    if (decision.action === "current") {
      await rm(statePath, { force: true });
    }
    return;
  }

  const attempt =
    retryState?.tag === latest ? retryState.attempt + 1 : 1;
  await writeState(statePath, {
    tag: latest,
    attempt,
    retryAfter: Date.now() + retryDelayMilliseconds(attempt),
  });
  try {
    await gh(ghPath, [
      "workflow",
      "run",
      "android-nightly.yml",
      "--repo",
      repository,
      "--field",
      `upstream_tag=${latest}`,
    ]);
    console.log(`dispatched: ${latest}`);
  } catch (error) {
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
