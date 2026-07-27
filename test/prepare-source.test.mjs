import test from "node:test";
import assert from "node:assert/strict";

import { prepareConfig } from "../scripts/prepare-source.mjs";

const fixture = `const config = {
  name: variant.appName,
  version: "0.1.0",
  updates: {
    enabled: true,
    url: "https://u.expo.dev/example",
  },
  android: {
    package: variant.androidPackage,
  },
};
`;

test("turns the upstream preview config into the companion identity", () => {
  const prepared = prepareConfig(fixture, {
    versionCode: 1785178485,
    versionName: "0.0.29-nightly.20260727.922",
  });
  assert.match(prepared, /name: "T3 Code Nightly"/);
  assert.match(prepared, /version: "0\.0\.29-nightly\.20260727\.922"/);
  assert.match(prepared, /enabled: false/);
  assert.match(prepared, /package: "dev\.r3xsean\.t3code\.nightly"/);
  assert.match(prepared, /versionCode: 1785178485/);
});

test("fails closed when upstream config shape changes", () => {
  assert.throws(
    () =>
      prepareConfig("const config = {};", {
        versionCode: 1,
        versionName: "0.0.29-nightly.20260727.922",
      }),
    /upstream config changed/,
  );
});

test("accepts routine upstream version-literal changes", () => {
  const changedVersion = fixture.replace('"0.1.0"', '"9.8.7"');
  const prepared = prepareConfig(changedVersion, {
    versionCode: 1785178485,
    versionName: "0.0.29-nightly.20260727.922",
  });
  assert.match(prepared, /version: "0\.0\.29-nightly\.20260727\.922"/);
});
