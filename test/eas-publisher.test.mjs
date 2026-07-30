import test from "node:test";
import assert from "node:assert/strict";

import {
  publisherConfig,
  publisherPackage,
} from "../scripts/eas-publisher.mjs";

test("builds a static trusted config matching the companion runtime", () => {
  const config = publisherConfig({
    expoProjectId: "f6933e31-cda6-4835-8f8d-93f4970ff60f",
    expoOwner: "r3xsean",
    updateChannel: "nightly",
    runtimeVersion: "5".repeat(40),
    versionName: "0.0.32-nightly.20260730.957",
  });
  assert.deepEqual(config.expo.extra.eas, {
    projectId: "f6933e31-cda6-4835-8f8d-93f4970ff60f",
  });
  assert.equal(config.expo.owner, "r3xsean");
  assert.equal(config.expo.runtimeVersion, "5".repeat(40));
  assert.equal(
    config.expo.updates.requestHeaders["expo-channel-name"],
    "nightly",
  );
  assert.equal(config.expo.android.package, "dev.r3xsean.t3code.nightly");
});

test("publisherPackage creates the minimal trusted EAS project manifest", () => {
  assert.deepEqual(
    publisherPackage({ versionName: "0.0.32-nightly.20260730.958" }),
    {
      name: "t3-code-android-nightly-publisher",
      version: "0.0.32-nightly.20260730.958",
      private: true,
      dependencies: {
        "expo-updates": "56.0.19",
      },
    },
  );
});

test("rejects malformed trusted publication inputs", () => {
  assert.throws(
    () =>
      publisherConfig({
        expoProjectId: "bad",
        expoOwner: "r3xsean",
        updateChannel: "nightly",
        runtimeVersion: "5".repeat(40),
        versionName: "0.0.32-nightly.20260730.957",
      }),
    /project/,
  );
  assert.throws(
    () =>
      publisherConfig({
        expoProjectId: "f6933e31-cda6-4835-8f8d-93f4970ff60f",
        expoOwner: "r3xsean",
        updateChannel: "nightly",
      }),
    /required/,
  );
});
