import test from "node:test";
import assert from "node:assert/strict";
import { githubApi } from "../scripts/github-api.mjs";

const timeout = () => new TypeError("fetch failed", {
  cause: Object.assign(new Error("Headers Timeout Error"), { code: "UND_ERR_HEADERS_TIMEOUT" }),
});

test("recovers the observed headers timeout on a release lookup with bounded backoff", async (t) => {
  let calls = 0;
  const delays = [];
  t.mock.method(globalThis, "fetch", async () => {
    if (++calls < 3) throw timeout();
    return Response.json({ id: 42, draft: false });
  });
  const result = await githubApi("token", { wait: async (ms) => delays.push(ms) })("/releases/tags/nightly");
  assert.equal(result.id, 42);
  assert.deepEqual(delays, [1000, 2000]);
});

test("persistent read outages stop after three requests", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw timeout(); });
  await assert.rejects(githubApi("token", { wait: async () => {} })("/releases"), /fetch failed/);
  assert.equal(calls, 3);
});

test("retries transient HTTP and body failures but not auth, validation, or malformed JSON", async (t) => {
  for (const status of [408, 500, 502, 503, 504, 401, 403, 404, 422]) {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => { calls++; return new Response("failure", { status }); });
    await assert.rejects(githubApi("token", { wait: async () => {} })("/releases"));
    assert.equal(calls, status >= 500 || status === 408 ? 3 : 1);
  }
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return { ok: true, status: 200, json: async () => { throw timeout(); } };
  });
  await assert.rejects(githubApi("token", { wait: async () => {} })("/releases"));
  assert.equal(calls, 3);
  calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response("not JSON"); });
  await assert.rejects(githubApi("token", { wait: async () => {} })("/releases"), SyntaxError);
  assert.equal(calls, 1);
});

test("never blindly retries mutation requests", async (t) => {
  for (const method of ["POST", "PATCH", "DELETE"]) {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => { calls++; throw timeout(); });
    await assert.rejects(githubApi("token", { wait: async () => {} })("/releases", { method }));
    assert.equal(calls, 1);
  }
});

test("enforces a request deadline and preserves caller cancellation", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url, { signal }) => {
    calls++;
    return new Promise((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("deadline did not fire")), 1000);
      signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
    });
  });
  await assert.rejects(githubApi("token", { timeoutMs: 5, wait: async () => {} })("/releases"), { name: "TimeoutError" });
  assert.equal(calls, 3);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(githubApi("token")("/releases", { signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls, 3);
});
