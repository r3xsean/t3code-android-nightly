import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const NIGHTLY =
  /^v(\d+)\.(\d+)\.(\d+)-nightly\.(\d{8})\.(\d+)$/;
const DEFAULT_REPOSITORY = "r3xsean/t3code-android-nightly";
const VARIABLE = "LAST_PROCESSED_UPSTREAM_TAG";

function tagParts(tag) {
  const match = tag?.match(NIGHTLY);
  if (!match) {
    throw new Error(`Invalid nightly tag: ${tag}`);
  }
  return match.slice(1).map(BigInt);
}

function compareTags(left, right) {
  const a = tagParts(left);
  const b = tagParts(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] < b[index]) return -1;
    if (a[index] > b[index]) return 1;
  }
  return 0;
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
  tagParts(latestUpstreamTag);
  if (processedTag) {
    tagParts(processedTag);
    if (compareTags(latestUpstreamTag, processedTag) <= 0) {
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
  return { action: "dispatch", tag: latestUpstreamTag };
}

async function gh(ghPath, args) {
  const { stdout } = await execFileAsync(ghPath, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

async function readState(statePath) {
  try {
    const state = JSON.parse(await readFile(statePath, "utf8"));
    if (
      typeof state?.tag !== "string" ||
      !Number.isInteger(state?.attempt) ||
      !Number.isFinite(state?.retryAfter)
    ) {
      throw new Error("invalid retry state");
    }
    return state;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function main() {
  const repository = process.env.COMPANION_REPOSITORY ?? DEFAULT_REPOSITORY;
  const ghPath = process.env.GH_PATH ?? "/opt/homebrew/bin/gh";
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

  let processedTag = "";
  try {
    const variable = JSON.parse(
      await gh(ghPath, [
        "api",
        `repos/${repository}/actions/variables/${VARIABLE}`,
      ]),
    );
    processedTag = variable.value;
  } catch (error) {
    if (!String(error?.stderr ?? "").includes("HTTP 404")) throw error;
  }

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
    console.log(`${decision.action}: ${latest}`);
    return;
  }

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
    await rm(statePath, { force: true });
    console.log(`dispatched: ${latest}`);
  } catch (error) {
    const attempt =
      retryState?.tag === latest ? Math.min(retryState.attempt + 1, 32) : 1;
    await mkdir(stateDirectory, { recursive: true });
    await writeFile(
      statePath,
      `${JSON.stringify(
        {
          tag: latest,
          attempt,
          retryAfter: Date.now() + retryDelayMilliseconds(attempt),
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
