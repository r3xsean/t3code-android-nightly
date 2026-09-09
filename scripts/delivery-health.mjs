import { appendFile } from "node:fs/promises";
import { githubApi } from "./github-api.mjs";
import { compareNightlyTags, NIGHTLY_PATTERN, processedTagFromRefs } from "./processed-state.mjs";

export const REPOSITORY = "r3xsean/t3code-android-nightly";
export const INCIDENT_MARKER = "<!-- t3code-delivery-health -->";
export const LAG_LIMIT_MS = 6 * 60 * 60_000;

export function assessHealth({ releases, refs, runs, now = Date.now() }) {
  const nightlies = releases.filter((r) => !r.draft && r.prerelease && NIGHTLY_PATTERN.test(r.tag_name ?? ""))
    .sort((a, b) => compareNightlyTags(b.tag_name, a.tag_name));
  if (!nightlies.length) throw new Error("No qualifying upstream nightly found");
  const latest = nightlies[0].tag_name;
  const processed = processedTagFromRefs(refs);
  const pending = nightlies.filter((r) => !processed || compareNightlyTags(r.tag_name, processed) > 0);
  const mainRuns = runs.filter((r) => r.head_branch === "main" && r.event === "workflow_dispatch")
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const active = mainRuns.some((r) => r.status !== "completed");
  const last = mainRuns.find((r) => r.status === "completed");
  const oldestPending = pending.length ? Math.min(...pending.map((r) => Date.parse(r.published_at))) : now;
  if (!Number.isFinite(oldestPending)) throw new Error("Invalid upstream publication time");
  const lagHours = Math.max(0, Math.floor((now - oldestPending) / 3_600_000));
  const failed = pending.length > 0 && last && ["failure", "timed_out", "action_required"].includes(last.conclusion);
  const stale = pending.length > 0 && now - oldestPending >= LAG_LIMIT_MS;
  return { latest, processed, active, lagHours, failed: Boolean(failed), stale,
    current: pending.length === 0, unhealthy: Boolean(failed || stale), run: last ?? null };
}

export async function loadHealth(api) {
  const [releases, refs, runs] = await Promise.all([
    api("/repos/pingdotgg/t3code/releases?per_page=100"),
    api(`/repos/${REPOSITORY}/git/matching-refs/tags/processed-nightly/`),
    api(`/repos/${REPOSITORY}/actions/workflows/android-nightly.yml/runs?per_page=100`),
  ]);
  return assessHealth({ releases, refs, runs: runs.workflow_runs });
}

export function healthBody(health) {
  return `${INCIDENT_MARKER}
The Android companion has not caught up with upstream.

- Latest upstream: \`${health.latest}\`
- Last delivered APK or OTA: \`${health.processed || "none"}\`
- Oldest observed undelivered nightly: ${health.lagHours} hours ago
- Build active: ${health.active ? "yes" : "no"}
- Last completed build: ${health.run?.html_url ?? "none"} (${health.run?.conclusion ?? "unknown"})

The Mac repair worker attempts bounded compatibility repairs and verifies them on GitHub before promotion. Changes outside its permitted scope need maintenance. This incident closes automatically only after successful delivery catches up. Phone-side update checks cannot fetch a build that has not been published.
`;
}

export async function syncHealthIncident(api, health) {
  const issues = await api(`/repos/${REPOSITORY}/issues?state=open&per_page=100&creator=github-actions%5Bbot%5D`);
  const incident = issues.find((i) => !i.pull_request && i.body?.startsWith(INCIDENT_MARKER));
  if (health.current && incident) {
    await api(`/repos/${REPOSITORY}/issues/${incident.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "completed" }) });
    return "resolved";
  }
  if (!health.unhealthy) return "healthy-or-building";
  const body = healthBody(health);
  if (incident) {
    if (incident.body !== body) await api(`/repos/${REPOSITORY}/issues/${incident.number}`, { method: "PATCH", body: JSON.stringify({ body }) });
    return "updated";
  }
  await api(`/repos/${REPOSITORY}/issues`, { method: "POST", body: JSON.stringify({ title: "Android nightly delivery needs recovery", body }) });
  return "opened";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const api = githubApi(process.env.GITHUB_TOKEN);
  const health = await loadHealth(api);
  console.log(JSON.stringify(health, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, health.current ? `Android delivery is current: ${health.processed}\n` : healthBody(health));
  if (!process.argv.includes("--check-only")) console.log(await syncHealthIncident(api, health));
}
