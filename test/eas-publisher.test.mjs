import test from "node:test";
import assert from "node:assert/strict";

import {
  publisherConfig,
  publisherPackage,
} from "../scripts/eas-publisher.mjs";

const connectPublicConfig = {
  T3CODE_CLERK_PUBLISHABLE_KEY: `pk_live_${Buffer.from(
    "clerk.t3.codes$",
  ).toString("base64url")}`,
  T3CODE_CLERK_JWT_TEMPLATE: "t3-relay",
  T3CODE_RELAY_URL: "https://relay.t3.codes",
};

test("builds a static trusted config matching the companion runtime", () => {
  const config = publisherConfig(
    {
      expoProjectId: "f6933e31-cda6-4835-8f8d-93f4970ff60f",
      expoOwner: "r3xsean",
      updateChannel: "nightly",
      runtimeVersion: "5".repeat(40),
      versionName: "0.0.32-nightly.20260730.957",
    },
    connectPublicConfig,
  );
  assert.deepEqual(config.expo.extra.eas, {
    projectId: "f6933e31-cda6-4835-8f8d-93f4970ff60f",
  });
  assert.deepEqual(config.expo.extra.clerk, {
    publishableKey: connectPublicConfig.T3CODE_CLERK_PUBLISHABLE_KEY,
    jwtTemplate: connectPublicConfig.T3CODE_CLERK_JWT_TEMPLATE,
  });
  assert.deepEqual(config.expo.extra.relay, {
    url: connectPublicConfig.T3CODE_RELAY_URL,
  });
  assert.equal(config.expo.owner, "r3xsean");
  assert.equal(config.expo.scheme, "t3code-preview");
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

test("rejects trusted publication when T3 Connect configuration is absent or changed", () => {
  const delivery = {
    expoProjectId: "f6933e31-cda6-4835-8f8d-93f4970ff60f",
    expoOwner: "r3xsean",
    updateChannel: "nightly",
    runtimeVersion: "5".repeat(40),
    versionName: "0.0.32-nightly.20260730.958",
  };
  assert.throws(
    () => publisherConfig(delivery, {}),
    /Missing GitHub Actions variable/,
  );
  assert.throws(
    () =>
      publisherConfig(delivery, {
        ...connectPublicConfig,
        T3CODE_RELAY_URL: "https://unexpected.example",
      }),
    /production relay/,
  );
});
