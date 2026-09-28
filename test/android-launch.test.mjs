import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessLaunch } from "../scripts/smoke-android.mjs";

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
