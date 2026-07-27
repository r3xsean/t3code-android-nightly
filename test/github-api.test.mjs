import test from "node:test";
import assert from "node:assert/strict";

import { githubApi } from "../scripts/github-api.mjs";

test("uses API paths and absolute upload URLs without rewriting them", async (t) => {
  const seen = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    seen.push(url);
    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  const api = githubApi("test-token");
  await api("/repos/example/project/releases");
  await api("https://uploads.github.com/repos/example/project/releases/1/assets?name=x.apk");

  assert.deepEqual(seen, [
    "https://api.github.com/repos/example/project/releases",
    "https://uploads.github.com/repos/example/project/releases/1/assets?name=x.apk",
  ]);
});
