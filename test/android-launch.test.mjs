import test from "node:test";
import assert from "node:assert/strict";
import { assessLaunch } from "../scripts/smoke-android.mjs";

const pkg = "dev.r3xsean.t3code.nightly";
const ui = `<hierarchy><node package="${pkg}" text="Add environment" /></hierarchy>`;
test("installation or a splash screen alone cannot pass Android launch verification", () => {
  assert.equal(assessLaunch({ pkg, pid: "123", foreground: `${pkg}/.MainActivity`, ui: '<node package="android" text="" />', crash: "" }), false);
  assert.equal(assessLaunch({ pkg, pid: "123", foreground: `${pkg}/.MainActivity`, ui, crash: "" }), true);
  assert.equal(assessLaunch({ pkg, pid: "123", foreground: "other.app/.MainActivity", ui, crash: "" }), false);
  assert.throws(() => assessLaunch({ pkg, pid: "", foreground: pkg, ui, crash: "" }), /process/);
  assert.throws(() => assessLaunch({ pkg, pid: "123", foreground: pkg, ui, crash: `FATAL EXCEPTION: main\nProcess: ${pkg}, PID: 123\nSoLoaderDSONotFoundError: libfbjni.so` }), /crashed/);
});
