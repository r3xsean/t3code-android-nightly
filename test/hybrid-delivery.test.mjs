import test from "node:test";
import assert from "node:assert/strict";

import {
  chooseDelivery,
  parseFingerprintOutput,
} from "../scripts/hybrid-delivery.mjs";

const fingerprint = "5729c1d569caaa4b1958001a7fe694dd48928446";
const nativeBase = {
  version_code: 1785425938,
  version_name: "0.0.32-nightly.20260730.956",
  native_fingerprint: fingerprint,
  expo_project_id: "11111111-2222-4333-8444-555555555555",
  expo_update_channel: "nightly",
};

test("compatible native fingerprints choose OTA", () => {
  assert.equal(chooseDelivery(fingerprint, nativeBase), "ota");
});

test("changed fingerprints and missing bases choose an APK", () => {
  assert.equal(chooseDelivery("a".repeat(40), nativeBase), "apk");
  assert.equal(chooseDelivery(fingerprint, null), "apk");
});

test("rejects a native base from another Expo project or channel", () => {
  assert.throws(
    () =>
      chooseDelivery(fingerprint, nativeBase, {
        expoProjectId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        updateChannel: "nightly",
      }),
    /Expo project/,
  );
  assert.throws(
    () =>
      chooseDelivery(fingerprint, nativeBase, {
        expoProjectId: nativeBase.expo_project_id,
        updateChannel: "preview",
      }),
    /update channel/,
  );
});

test("parses Expo fingerprint output and fails closed on malformed data", () => {
  assert.equal(
    parseFingerprintOutput(JSON.stringify({ hash: fingerprint })),
    fingerprint,
  );
  assert.throws(() => parseFingerprintOutput("{}"), /fingerprint hash/);
  assert.throws(() => parseFingerprintOutput("not json"), /fingerprint output/);
});
