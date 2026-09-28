import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { APPLICATION_ID } from "./companion-contract.mjs";

const exec = promisify(execFile);

export function assessLaunch({ pkg, pid, foreground, ui, crash }) {
  if (crash.includes(`Process: ${pkg},`) || crash.includes(`>>> ${pkg} <<<`)) throw new Error("Android app crashed; see crash-log.txt");
  if (!/^\d+$/.test(pid.trim())) throw new Error("Android app process exited or was not uniquely running");
  if (/This screen couldn(?:'|&apos;)t be displayed|copy the details for a bug report/i.test(ui)) throw new Error("Android app displayed its render-error boundary");
  return foreground.includes(`${pkg}/`) && [...ui.matchAll(/<node\b[^>]*>/g)].some(([node]) =>
    node.includes(`package="${pkg}"`) && /(?:text|content-desc)="[^"\s][^"]*"/.test(node));
}

async function main() {
  const [apk, output, serial = "emulator-5554"] = process.argv.slice(2);
  if (!apk || !output || !/^emulator-\d+$/.test(serial)) throw new Error("Usage: smoke-android.mjs <apk> <evidence-dir> [emulator-serial]; physical devices are not allowed");
  await mkdir(output, { recursive: true });
  const pkg = APPLICATION_ID;
  const adb = async (...args) => (await exec("adb", ["-s", serial, ...args], { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 })).stdout;
  const optional = async (...args) => { try { return await adb(...args); } catch { return ""; } };
  try {
    if ((await adb("shell", "getprop", "sys.boot_completed")).trim() !== "1") throw new Error("Emulator is not booted");
    await adb("install", "-r", path.resolve(apk));
    // Test the embedded artifact, not a downloaded OTA that could hide a bad APK.
    await adb("shell", "svc", "wifi", "disable");
    await adb("shell", "svc", "data", "disable");
    await adb("shell", "input", "keyevent", "KEYCODE_WAKEUP");
    await adb("shell", "wm", "dismiss-keyguard");
    for (let launch = 1; launch <= 2; launch++) {
      await adb("shell", "am", "force-stop", pkg);
      await adb("logcat", "-c");
      await adb("shell", "am", "start", "-W", "-n", `${pkg}/.MainActivity`);
      const deadline = Date.now() + 120_000;
      let initialPid;
      let readyAt;
      while (Date.now() < deadline) {
        await delay(3000);
        const pid = (await optional("shell", "pidof", pkg)).trim();
        const crash = await adb("logcat", "-d", "-b", "crash", "-v", "brief");
        await writeFile(path.join(output, "crash-log.txt"), crash);
        if (!initialPid) initialPid = pid;
        if (pid !== initialPid) throw new Error("Android app restarted unexpectedly during launch");
        await adb("shell", "uiautomator", "dump", "/sdcard/t3-launch-window.xml");
        const ui = await adb("exec-out", "cat", "/sdcard/t3-launch-window.xml");
        const foreground = await adb("shell", "dumpsys", "activity", "activities");
        await writeFile(path.join(output, `launch-${launch}.xml`), ui);
        // Restrict to the resumed activity; a background task is not a launch pass.
        const resumed = foreground.split("\n").filter((line) => /mResumedActivity|topResumedActivity/.test(line)).join("\n");
        if (assessLaunch({ pkg, pid, foreground: resumed, ui, crash })) {
          readyAt ??= Date.now();
          if (Date.now() - readyAt >= 30_000) break;
        } else readyAt = undefined;
      }
      if (!readyAt || Date.now() - readyAt < 30_000) throw new Error("App never rendered stable foreground UI beyond the splash screen");
      const { stdout } = await exec("adb", ["-s", serial, "exec-out", "screencap", "-p"], { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 });
      await writeFile(path.join(output, `launch-${launch}.png`), stdout);
    }
    console.log("PASS: exact APK rendered stable foreground UI on two offline cold launches");
  } finally {
    await writeFile(path.join(output, "logcat.txt"), await optional("logcat", "-d", "-v", "threadtime"));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
