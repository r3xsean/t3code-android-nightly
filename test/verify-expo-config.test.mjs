import test from "node:test";
import assert from "node:assert/strict";

import { verifyExpoConfig } from "../scripts/verify-expo-config.mjs";

const expected = {
  expoProjectId: "f6933e31-cda6-4835-8f8d-93f4970ff60f",
  expoOwner: "r3xsean",
  updateChannel: "nightly",
  runtimeVersion: "5".repeat(40),
  versionName: "0.0.32-nightly.20260730.957",
};

const config = {
  name: "T3 Code Nightly",
  slug: "t3-code-android-nightly",
  scheme: "t3code-preview",
  owner: "r3xsean",
  version: expected.versionName,
  runtimeVersion: expected.runtimeVersion,
  updates: {
    enabled: true,
    url: `https://u.expo.dev/${expected.expoProjectId}`,
    requestHeaders: { "expo-channel-name": "nightly" },
    checkAutomatically: "ON_LOAD",
    fallbackToCacheTimeout: 0,
  },
  android: { package: "dev.r3xsean.t3code.nightly" },
  extra: { eas: { projectId: expected.expoProjectId } },
};

test("accepts the resolved companion Expo configuration", () => {
  assert.doesNotThrow(() => verifyExpoConfig(config, expected));
});

test("fails closed on a mismatched project, channel, or runtime", () => {
  assert.throws(
    () =>
      verifyExpoConfig(
        {
          ...config,
          updates: {
            ...config.updates,
            requestHeaders: { "expo-channel-name": "production" },
          },
        },
        expected,
      ),
    /configuration mismatch/,
  );
  assert.throws(
    () => verifyExpoConfig({ ...config, scheme: "wrong" }, expected),
    /configuration mismatch/,
  );
});
