import assert from "node:assert/strict";
import test from "node:test";
import { reconcile } from "../scripts/repair-nightly.mjs";

function fixture({ conclusion = "success", currentMain = "base", running = false } = {}) {
  const calls = [];
  let main = currentMain;
  const run = { id: 42, head_sha: "base", display_title: "Verify repair candidate", path: ".github/workflows/verify-repair.yml", status: running ? "in_progress" : "completed", conclusion, event: "workflow_dispatch", head_branch: "main" };
  const api = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("verify-repair.yml/runs")) return { workflow_runs: [run] };
    if (url.includes("/jobs")) return { jobs: [
      { name: "Build candidate APK", conclusion: "success", steps: [{ name: "Compile release APK", conclusion: "success" }] },
      { name: "Verify candidate artifact", conclusion: "success" },
    ] };
    if (url.includes("/compare/")) return { status: "ahead", ahead_by: 1, behind_by: 0, commits: [{ parents: [{ sha: "base" }] }], files: [{ filename: "scripts/align-react.mjs", status: "modified" }] };
    if (url.endsWith("/git/ref/heads/main")) return { object: { sha: main } };
    if (url.endsWith("/git/refs/heads/main")) { main = JSON.parse(options.body).sha; return {}; }
    if (url.includes("android-nightly.yml/runs")) return { workflow_runs: [] };
    if (url.endsWith("/dispatches")) return null;
    throw new Error(`Unexpected ${url}`);
  };
  const state = { attempts: [], pending: { base: "base", sha: "candidate", tag: "nightly", stage: "verify", createdAt: Date.now() } };
  return { api, calls, state };
}

test("completed independent verification promotes exactly the candidate then dispatches publication", async () => {
  const { api, calls, state } = fixture();
  await reconcile(api, state, async () => {});
  const mutations = calls.filter((call) => call.options);
  assert.deepEqual(JSON.parse(mutations[0].options.body), { sha: "candidate", force: false });
  assert.match(mutations[1].url, /android-nightly.yml\/dispatches$/);
  assert.equal(state.pending, null);
});
test("failed, still-running, and stale-base candidates never change main or publish", async () => {
  for (const options of [{ conclusion: "failure" }, { currentMain: "new-main" }, { running: true }]) {
    const { api, calls, state } = fixture(options);
    if (options.running) await reconcile(api, state, async () => {});
    else await assert.rejects(reconcile(api, state, async () => {}));
    assert.equal(calls.some((call) => call.options), false);
  }
});
