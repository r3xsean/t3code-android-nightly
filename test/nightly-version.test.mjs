import test from "node:test";
import assert from "node:assert/strict";
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

test("environment-backed upstream versions normalize and finalize to the selected nightly", () => {
  const neutral = prepareFingerprintConfig(config, delivery);
  assert.match(neutral, /version: "0\.0\.0-nightly\.19700101\.1"/);
  assert.doesNotMatch(neutral, /T3CODE_MOBILE_VERSION/);
  const final = finalizeConfig(neutral, {
    versionCode: 1792126527,
    versionName: "0.1.1-nightly.20261016.3190",
    runtimeVersion: "a".repeat(40),
  });
  assert.match(final, /version: "0\.1\.1-nightly\.20261016\.3190"/);
  assert.match(final, /versionCode: 1792126527/);
  assert.match(final, /package: "dev\.r3xsean\.t3code\.nightly"/);
});

test("unknown and duplicate upstream version declarations still fail closed", () => {
  for (const expression of ['getVersion()', 'repoEnv.OTHER_VERSION ?? "2.0.0"']) {
    assert.throws(() => prepareFingerprintConfig(config.replace(
      'repoEnv.T3CODE_MOBILE_VERSION ?? "2.0.0"', expression,
    ), delivery), /application version.*upstream config changed/);
  }
  assert.throws(() => prepareFingerprintConfig(config.replace(
    '  version:', '  version: "1.0.0",\n  version:',
  ), delivery), /application version.*upstream config changed/);
  assert.throws(() => prepareFingerprintConfig(config.replace(
    '  version:', '  version: getVersion(),\n  version:',
  ), delivery), /application version.*upstream config changed/);
});
