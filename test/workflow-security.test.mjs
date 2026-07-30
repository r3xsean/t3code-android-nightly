import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function job(workflow, name, nextName) {
  const start = workflow.indexOf(`\n  ${name}:`);
  const end = workflow.indexOf(`\n  ${nextName}:`, start + 1);
  assert.notEqual(start, -1, `missing ${name} job`);
  assert.notEqual(end, -1, `missing ${nextName} job`);
  return workflow.slice(start, end);
}

test("untrusted preparation never receives publishing or signing credentials", async () => {
  const workflow = await readFile(".github/workflows/android-nightly.yml", "utf8");
  const build = job(workflow, "build", "publish-ota");
  for (const credential of [
    "EXPO_TOKEN",
    "SIGNING_KEYSTORE_BASE64",
    "SIGNING_STORE_PASSWORD",
    "SIGNING_KEY_PASSWORD",
  ]) {
    assert.doesNotMatch(build, new RegExp(credential));
  }
});

test("trusted OTA publisher checks out only the builder and executes a locked CLI", async () => {
  const workflow = await readFile(".github/workflows/android-nightly.yml", "utf8");
  const publish = job(workflow, "publish-ota", "record-ota");
  assert.match(publish, /Check out trusted builder only/);
  assert.doesNotMatch(publish, /pingdotgg|path:\s*source/);
  assert.match(publish, /npm ci --ignore-scripts/);
  assert.match(publish, /builder\/node_modules\/\.bin\/eas" update/);
  assert.doesNotMatch(publish, /npm install --global/);
  assert.doesNotMatch(publish, /contents:\s*write/);
  assert.doesNotMatch(publish, /GITHUB_TOKEN/);
});

test("OTA state recording uses a fresh job without the Expo token or EAS tree", async () => {
  const workflow = await readFile(".github/workflows/android-nightly.yml", "utf8");
  const record = job(workflow, "record-ota", "sign");
  assert.match(record, /Check out a clean trusted builder/);
  assert.match(record, /contents:\s*write/);
  assert.match(record, /record-processed\.mjs/);
  assert.doesNotMatch(record, /EXPO_TOKEN|node_modules\/\.bin\/eas/);
});

test("native fingerprinting uses a fixed neutral version, not the previous APK version", async () => {
  const workflow = await readFile(".github/workflows/android-nightly.yml", "utf8");
  const build = job(workflow, "build", "publish-ota");
  assert.match(build, /prepare-source\.mjs fingerprint source/);
  assert.doesNotMatch(build, /native_base\.version_(?:code|name)/);
});
