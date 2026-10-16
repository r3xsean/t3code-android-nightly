import test from "node:test";
import assert from "node:assert/strict";

import {
  finalizeConfig,
  prepareConfig,
  prepareFingerprintConfig,
} from "../scripts/prepare-source.mjs";

const fixture = `const config = {
  name: variant.appName,
  slug: "t3-code",
  version: "0.1.0",
  runtimeVersion: {
    policy: process.env.MOBILE_VERSION_POLICY ?? "fingerprint",
  },
  updates: {
    enabled: true,
    url: "https://u.expo.dev/d763fcb8-d37c-41ea-a773-b54a0ab4a454",
    checkAutomatically: "ON_LOAD",
    fallbackToCacheTimeout: 0,
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

const companion = {
  versionCode: 1785178485,
  versionName: "0.0.29-nightly.20260727.922",
  expoProjectId: "11111111-2222-4333-8444-555555555555",
  expoOwner: "sean",
  updateChannel: "nightly",
};

test("turns upstream config into an OTA-enabled companion identity", () => {
  const prepared = prepareConfig(fixture, {
    ...companion,
  });
  assert.match(prepared, /name: "T3 Code Nightly"/);
  assert.match(prepared, /slug: "t3-code-android-nightly"/);
  assert.match(prepared, /version: "0\.0\.29-nightly\.20260727\.922"/);
  assert.match(prepared, /enabled: true/);
  assert.match(
    prepared,
    /url: "https:\/\/u\.expo\.dev\/11111111-2222-4333-8444-555555555555"/,
  );
  assert.match(prepared, /"expo-channel-name": "nightly"/);
  assert.match(prepared, /checkAutomatically: "NEVER"/);
  assert.doesNotMatch(prepared, /checkAutomatically: "ON_LOAD"/);
  assert.match(prepared, /package: "dev\.r3xsean\.t3code\.nightly"/);
  assert.match(prepared, /versionCode: 1785178485/);
  assert.match(
    prepared,
    /projectId: "11111111-2222-4333-8444-555555555555"/,
  );
  assert.match(prepared, /owner: "sean"/);
  assert.match(prepared, /policy: process\.env\.MOBILE_VERSION_POLICY/);
});

test("uses one neutral delivery version for every native fingerprint", () => {
  const prepared = prepareFingerprintConfig(fixture, companion);
  assert.match(prepared, /version: "0\.0\.0-nightly\.19700101\.1"/);
  assert.match(prepared, /versionCode: 1/);
  assert.doesNotMatch(prepared, /1785178485/);
});

test("finalizes the runtime and delivery version after fingerprinting", () => {
  const prepared = prepareConfig(fixture, companion);
  const finalized = finalizeConfig(prepared, {
    runtimeVersion: "5729c1d569caaa4b1958001a7fe694dd48928446",
    versionCode: 1785260000,
    versionName: "0.0.32-nightly.20260730.957",
  });
  assert.match(
    finalized,
    /runtimeVersion: "5729c1d569caaa4b1958001a7fe694dd48928446"/,
  );
  assert.doesNotMatch(finalized, /MOBILE_VERSION_POLICY/);
  assert.match(finalized, /versionCode: 1785260000/);
  assert.match(finalized, /version: "0\.0\.32-nightly\.20260730\.957"/);
});

test("fails closed when upstream config shape changes", () => {
  assert.throws(
    () =>
      prepareConfig("const config = {};", {
        ...companion,
        versionCode: 1,
      }),
    /upstream config changed/,
  );
});

test("accepts routine upstream version-literal changes", () => {
  const changedVersion = fixture.replace('"0.1.0"', '"9.8.7"');
  const prepared = prepareConfig(changedVersion, {
    ...companion,
  });
  assert.match(prepared, /version: "0\.0\.29-nightly\.20260727\.922"/);
});

test("normalizes the environment-backed upstream version before fingerprinting and finalization", () => {
  const upstream = fixture.replace(
    '  version: "0.1.0",',
    '  version: repoEnv.T3CODE_MOBILE_VERSION ?? "2.0.0",',
  );
  const prepared = prepareFingerprintConfig(upstream, companion);
  assert.match(prepared, /version: "0\.0\.0-nightly\.19700101\.1"/);
  assert.match(prepared, /versionCode: 1,/);
  assert.doesNotMatch(prepared, /T3CODE_MOBILE_VERSION/);
  assert.equal(
    prepared,
    prepareFingerprintConfig(
      upstream.replace('?? "2.0.0"', '?? "2.1.0"'),
      companion,
    ),
  );
  const finalized = finalizeConfig(prepared, {
    runtimeVersion: "5729c1d569caaa4b1958001a7fe694dd48928446",
    versionCode: 1792126527,
    versionName: "0.1.1-nightly.20261016.3190",
  });
  assert.match(finalized, /version: "0\.1\.1-nightly\.20261016\.3190"/);
  assert.match(finalized, /versionCode: 1792126527,/);
  assert.match(finalized, /runtimeVersion: "5729c1d569caaa4b1958001a7fe694dd48928446"/);
  assert.doesNotMatch(finalized, /T3CODE_MOBILE_VERSION/);
});

test("rejects unknown version expressions and duplicate supported version fields", () => {
  for (const replacement of [
    '  version: repoEnv.OTHER_VERSION ?? "2.0.0",',
    '  version: repoEnv.T3CODE_MOBILE_VERSION || "2.0.0",',
    '  version: getVersion(),',
    '  version: "0.1.0",\n  version: repoEnv.T3CODE_MOBILE_VERSION ?? "2.0.0",',
  ]) {
    assert.throws(
      () => prepareFingerprintConfig(
        fixture.replace('  version: "0.1.0",', replacement),
        companion,
      ),
      /Expected exactly one application version insertion point/,
    );
  }
});

test("rejects malformed Expo publication identity", () => {
  assert.throws(
    () => prepareConfig(fixture, { ...companion, expoProjectId: "not-a-uuid" }),
    /Expo project ID/,
  );
  assert.throws(
    () => prepareConfig(fixture, { ...companion, updateChannel: "nightly beta" }),
    /Expo update channel/,
  );
});
