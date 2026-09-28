import test from "node:test";
import assert from "node:assert/strict";
import { expectedFbjni, compatibilityDecision, compatibilityFingerprint, repairGradle } from "../scripts/native-compat.mjs";

test("native recovery follows React Native's fbjni catalog and leaves an upstream-fixed graph alone", () => {
  assert.equal(expectedFbjni('[versions]\nfbjni = "0.7.0"\n'), "0.7.0");
  assert.equal(expectedFbjni('[versions]\nfbjni = "0.8.1"\n'), "0.8.1");
  assert.equal(compatibilityDecision("0.7.0", ["0.8.1"]), "repair");
  assert.equal(compatibilityDecision("0.7.0", ["0.7.0"]), "unchanged");
  assert.equal(compatibilityDecision("0.8.1", ["0.8.1"]), "unchanged");
});

test("an upstream fix is byte-for-byte unchanged; an actual mismatch is repaired only once", () => {
  const upstream = "allprojects { configurations.all { resolutionStrategy.force 'com.facebook.fbjni:fbjni:0.7.0' } }\n";
  assert.equal(repairGradle(upstream, "0.7.0", ["0.7.0"]), upstream);
  const fixed = repairGradle("// upstream\n", "0.8.1", ["0.7.0"]);
  assert.match(fixed, /force 'com.facebook.fbjni:fbjni:0.8.1'/);
  assert.equal(repairGradle(fixed, "0.8.1", ["0.8.1"]), fixed);
  assert.throws(() => repairGradle(fixed, "0.8.1", ["0.7.0"]), /did not resolve/);
});

test("unknown or ambiguous native resolution cannot pass the gate", () => {
  for (const catalog of ["", 'fbjni = "latest"', 'fbjni = "0.7.0"\nfbjni = "0.8.1"']) assert.throws(() => expectedFbjni(catalog));
  for (const graph of [[], ["0.7.0", "0.8.1"], ["+"], null]) assert.throws(() => compatibilityDecision("0.7.0", graph));
});

test("the recovery runtime is isolated from broken APKs and follows future native upgrades", () => {
  const old = "a".repeat(40);
  const fixed = compatibilityFingerprint(old, "0.7.0");
  assert.match(fixed, /^[a-f0-9]{40}$/);
  assert.notEqual(fixed, old);
  assert.equal(fixed, compatibilityFingerprint(old, "0.7.0"));
  assert.notEqual(fixed, compatibilityFingerprint(old, "0.8.1"));
  assert.throws(() => compatibilityFingerprint("unknown", "0.7.0"));
});
