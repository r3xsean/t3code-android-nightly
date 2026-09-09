import assert from "node:assert/strict";
import test from "node:test";
import { assessHealth, syncHealthIncident, INCIDENT_MARKER } from "../scripts/delivery-health.mjs";

const latest = "v0.0.41-nightly.20260909.1439";
const releases = [{ tag_name: latest, draft: false, prerelease: true, published_at: "2026-09-09T00:00:00Z" }];
const now = Date.parse("2026-09-09T12:00:00Z");
const failure = { head_branch: "main", event: "workflow_dispatch", status: "completed", conclusion: "failure", created_at: "2026-09-09T01:00:00Z" };
test("an offline dispatcher is detected without a failed run", () => {
  assert.equal(assessHealth({ releases, refs: [], runs: [], now }).stale, true);
});
test("a fresh failed build opens recovery before the six-hour lag threshold", () => {
  assert.equal(assessHealth({ releases, refs: [], runs: [failure], now: Date.parse("2026-09-09T01:05:00Z") }).failed, true);
});
test("caught-up OTA state overrides older failed runs", () => {
  const health = assessHealth({ releases, refs: [{ ref: `refs/tags/processed-nightly/${latest}` }], runs: [failure], now });
  assert.equal(health.current, true);
  assert.equal(health.unhealthy, false);
});
test("new releases have a grace period and candidate failures do not implicate main", () => {
  const health = assessHealth({ releases, refs: [], runs: [{ ...failure, head_branch: "auto-repair/example" }], now: Date.parse("2026-09-09T01:05:00Z") });
  assert.equal(health.unhealthy, false);
});
test("updates a single incident and closes it only after delivery catches up", async () => {
  const calls = [];
  const api = async (url, options) => {
    calls.push({ url, options });
    return options ? {} : [{ number: 7, body: `${INCIDENT_MARKER}\nold` }];
  };
  assert.equal(await syncHealthIncident(api, { unhealthy: true, latest, processed: "", lagHours: 12 }), "updated");
  assert.equal(calls.filter((c) => c.options?.method === "POST").length, 0);
  calls.length = 0;
  assert.equal(await syncHealthIncident(api, { unhealthy: false, current: false }), "healthy-or-building");
  assert.equal(calls.length, 1);
  assert.equal(await syncHealthIncident(api, { current: true }), "resolved");
  assert.equal(JSON.parse(calls.at(-1).options.body).state, "closed");
});
