import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { prepareFingerprintConfig, finalizeConfig } from "../scripts/prepare-source.mjs";

const config = `const config = {
  name: variant.appName,
  slug: "t3-code",
  version: repoEnv.T3CODE_MOBILE_VERSION ?? "2.0.0",
  runtimeVersion: {
    policy: runtimeVersionPolicy,
  },
  updates: {
    enabled: repoEnv.T3CODE_MOBILE_UPDATES_ENABLED !== "0",
    url: "https://u.expo.dev/d763fcb8-d37c-41ea-a773-b54a0ab4a454",
    checkAutomatically: "ON_LOAD",
  },
  android: {
    package: variant.androidPackage,
  },
  extra: {
    eas: {
      projectId: "d763fcb8-d37c-41ea-a773-b54a0ab4a454",
    },
  },
  owner: "pingdotgg",
};
`;
const delivery = {
  expoProjectId: "11111111-2222-4333-8444-555555555555",
  expoOwner: "sean",
  updateChannel: "nightly",
};
const release = {
  versionCode: 1792198800,
  versionName: "0.1.1-nightly.20261017.3234",
  runtimeVersion: "a".repeat(40),
};

function evaluate(source, version) {
  return runInNewContext(`${source}\nconfig`, {
    variant: {},
    repoEnv: { T3CODE_MOBILE_VERSION: version },
    runtimeVersionPolicy: "fingerprint",
  });
}

test("environment-backed versions normalize independently of upstream defaults and environment", () => {
  const neutral = prepareFingerprintConfig(config, delivery);
  assert.equal(neutral, prepareFingerprintConfig(config.replace('"2.0.0"', '"3.1.0"'), delivery));
  const finalized = finalizeConfig(neutral, release);
  for (const version of [undefined, "9.9.9", "unexpected-env-value"]) {
    const fingerprint = evaluate(neutral, version);
    assert.equal(fingerprint.version, "0.0.0-nightly.19700101.1");
    assert.equal(fingerprint.android.versionCode, 1);
    const actual = evaluate(finalized, version);
    assert.equal(actual.version, release.versionName);
    assert.equal(actual.android.versionCode, release.versionCode);
    assert.equal(actual.runtimeVersion, release.runtimeVersion);
    assert.equal(actual.android.package, "dev.r3xsean.t3code.nightly");
    assert.equal(actual.updates.enabled, true);
    assert.equal(actual.updates.checkAutomatically, "NEVER");
    assert.equal(actual.updates.url, `https://u.expo.dev/${delivery.expoProjectId}`);
    assert.equal(actual.updates.requestHeaders["expo-channel-name"], "nightly");
  }
});

test("unknown, missing and duplicate upstream version declarations fail closed", () => {
  for (const expression of ["getVersion()", 'repoEnv.OTHER_VERSION ?? "2.0.0"']) {
    assert.throws(() => prepareFingerprintConfig(config.replace(
      'repoEnv.T3CODE_MOBILE_VERSION ?? "2.0.0"', expression,
    ), delivery), /application version.*upstream config changed/);
  }
  assert.throws(() => prepareFingerprintConfig(config.replace(
    '  version: repoEnv.T3CODE_MOBILE_VERSION ?? "2.0.0",\n', "",
  ), delivery), /application version.*upstream config changed/);
  for (const extra of ['"1.0.0"', "getVersion()", 'repoEnv.T3CODE_MOBILE_VERSION ?? "3.0.0"']) {
    assert.throws(() => prepareFingerprintConfig(config.replace(
      "  version:", `  version: ${extra},\n  version:`,
    ), delivery), /application version.*upstream config changed/);
  }
});

test("preparation CLI fingerprints and finalizes files even when its script path contains spaces", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "nightly version "));
  t.after(() => rm(root, { recursive: true, force: true }));
  const scripts = path.join(root, "builder scripts");
  await mkdir(scripts);
  for (const name of ["prepare-source.mjs", "companion-contract.mjs"]) {
    await writeFile(path.join(scripts, name), await readFile(new URL(`../scripts/${name}`, import.meta.url)));
  }
  const mobile = path.join(root, "apps/mobile");
  await mkdir(mobile, { recursive: true });
  const configPath = path.join(mobile, "app.config.ts");
  await writeFile(configPath, config);
  const script = path.join(scripts, "prepare-source.mjs");
  execFileSync(process.execPath, [script, "fingerprint", root], {
    env: {
      ...process.env,
      EXPO_PROJECT_ID: delivery.expoProjectId,
      EXPO_OWNER: delivery.expoOwner,
      EXPO_UPDATE_CHANNEL: delivery.updateChannel,
    },
  });
  assert.equal(await readFile(configPath, "utf8"), prepareFingerprintConfig(config, delivery));
  execFileSync(process.execPath, [script, "finalize", root, String(release.versionCode), release.versionName, release.runtimeVersion]);
  assert.equal(evaluate(await readFile(configPath, "utf8"), "9.9.9").version, release.versionName);
});
