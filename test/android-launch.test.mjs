import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessLaunch, translatedLibraryPaths, installedArm64LibraryDirectory } from "../scripts/smoke-android.mjs";

const pkg = "dev.r3xsean.t3code.nightly";
const ui = `<hierarchy><node package="${pkg}" text="Add environment" /></hierarchy>`;
test("installation or a splash screen alone cannot pass Android launch verification", () => {
  assert.equal(assessLaunch({ pkg, pid: "123", foreground: `${pkg}/.MainActivity`, ui: '<node package="android" text="" />', crash: "" }), false);
  assert.equal(assessLaunch({ pkg, pid: "123", foreground: `${pkg}/.MainActivity`, ui, crash: "" }), true);
  assert.equal(assessLaunch({ pkg, pid: "123", foreground: "other.app/.MainActivity", ui, crash: "" }), false);
  assert.throws(() => assessLaunch({ pkg, pid: "", foreground: pkg, ui, crash: "" }), /process/);
  const nativeCrash = readFileSync(new URL("./fixtures/android-native-crash.txt", import.meta.url), "utf8");
  assert.throws(() => assessLaunch({ pkg, pid: "123", foreground: pkg, ui, crash: nativeCrash }), /crashed/);
  assert.throws(() => assessLaunch({ pkg, pid: "123", foreground: `${pkg}/.MainActivity`, ui: `<node package="${pkg}" text="This screen couldn't be displayed" />`, crash: "" }), /render-error/);
});

test("translated emulator staging accepts only APK library basenames and the installed app library directory", () => {
  const directory = "/data/app/~~abc/dev.r3xsean.t3code.nightly-abc==/lib/arm64";
  assert.equal(installedArm64LibraryDirectory(`    legacyNativeLibraryDir=${directory.slice(0, -6)}\n    primaryCpuAbi=arm64-v8a\n`), directory);
  assert.equal(installedArm64LibraryDirectory(`    nativeLibraryDir=${directory}\n    primaryCpuAbi=arm64-v8a\n`), directory);
  assert.throws(() => installedArm64LibraryDirectory(`primaryCpuAbi=x86_64\nnativeLibraryDir=${directory}`), /not ARM64/);
  assert.deepEqual(translatedLibraryPaths(["assets/app.bundle", "lib/arm64-v8a/libfbjni.so"], directory), ["lib/arm64-v8a/libfbjni.so"]);
  for (const invalid of ["/data/local/tmp", "/data/app/../lib/arm64", "/data/app/x;touch-x/lib/arm64", ""]) assert.throws(() => translatedLibraryPaths(["lib/arm64-v8a/libfbjni.so"], invalid));
  for (const entries of [[], ["lib/arm64-v8a/../../bad.so"], ["lib/arm64-v8a/lib$(bad).so"]]) assert.throws(() => translatedLibraryPaths(entries, directory));
});
