import assert from "node:assert/strict";
import test from "node:test";
import { validateProposal, repairDecision, validateCandidateDiff, validateVerification, REPAIR_MODEL, REPAIR_EFFORT } from "../scripts/repair-policy.mjs";

test("repairs may change any repository file, but cannot escape the repository", () => {
  for (const path of [".github/workflows/android-nightly.yml", "scripts/prepare-source.mjs", "test/align-react.test.mjs", "package.json", "patches/mobile.patch"]) {
    assert.equal(validateProposal({ status: "patch", files: [{ path, content: "new" }] }, {}).length, 1);
  }
  for (const path of ["scripts/../scripts/align-react.mjs", "/tmp/file", ".git/config"]) assert.throws(() => validateProposal({ status: "patch", files: [{ path, content: "bad" }] }, {}), /Invalid/);
});
test("both repair and review explicitly select GPT-6 Astra at high effort", () => {
  assert.equal(REPAIR_MODEL, "gpt-6-astra");
  assert.equal(REPAIR_EFFORT, "high");
});
test("failed repairs retry with backoff without a permanent daily or per-nightly cutoff", () => {
  const health = { unhealthy: true, latest: "nightly" };
  assert.equal(repairDecision(health, {}, 1000), "repair");
  assert.equal(repairDecision(health, { attempts: [{ at: 900, tag: "a" }, { at: 950, tag: "b" }], lastFailureAt: 999 }, 1000), "backoff");
  assert.equal(repairDecision(health, { attempts: Array.from({ length: 20 }, () => ({ at: 1, tag: "nightly" })), lastFailureAt: 1 }, 100_000_000), "repair");
  assert.equal(repairDecision({ ...health, current: true }, {}, 1000), "idle");
  assert.equal(repairDecision(health, { pending: {} }, 1000), "verify");
});
test("promotion accepts one repair commit above the exact verified base", () => {
  const diff = { status: "ahead", ahead_by: 1, behind_by: 0, commits: [{ parents: [{ sha: "base" }] }], files: [{ filename: "scripts/align-react.mjs", status: "modified" }] };
  validateCandidateDiff(diff, "base");
  validateCandidateDiff({ ...diff, files: [{ filename: "scripts/repair-policy.mjs", status: "modified" }] }, "base");
  assert.throws(() => validateCandidateDiff(diff, "moved-base"), /trusted base/);
});
test("a green no-op or publishing run cannot count as a verified repair", () => {
  const run = { head_sha: "base", display_title: "Verify repair candidate", path: ".github/workflows/verify-repair.yml", status: "completed", conclusion: "success", event: "workflow_dispatch", head_branch: "main" };
  const build = { name: "Build candidate APK", conclusion: "success", steps: [{ name: "Compile release APK", conclusion: "success" }] };
  const artifact = { name: "Verify candidate artifact", conclusion: "success" };
  validateVerification(run, [build, artifact], "candidate");
  assert.throws(() => validateVerification(run, [], "candidate"), /real Android/);
  assert.throws(() => validateVerification(run, [build], "different-sha"), /matching/);
  assert.throws(() => validateVerification(run, [build, { name: "Publish native fallback APK", conclusion: "success" }], "candidate"), /publishing/);
  assert.throws(() => validateVerification(run, [build], "candidate"), /Independent APK/);
});
