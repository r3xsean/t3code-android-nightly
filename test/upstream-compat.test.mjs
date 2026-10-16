import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/upstream-compat.mjs", import.meta.url));
const packagePatch = "patches/expo-widgets@58.0.18.patch";
const original = "diff --git a/keep.txt b/keep.txt\n--- a/keep.txt\n+++ b/keep.txt\n@@ -1 +1 @@\n-before\n+upstream fix\n";
const hash = (text) => createHash("sha256").update(text).digest("hex");

async function fixture(t, version = "58.0.18") {
  const root = await mkdtemp(path.join(os.tmpdir(), "t3 widgets repair "));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "apps/mobile"), { recursive: true });
  await mkdir(path.join(root, "patches"));
  await writeFile(path.join(root, "apps/mobile/package.json"), JSON.stringify({
    dependencies: { "expo-widgets": version },
  }));
  await writeFile(path.join(root, "pnpm-workspace.yaml"), `patchedDependencies:\n  expo-widgets@58.0.18: ${packagePatch}\n`);
  await writeFile(path.join(root, packagePatch), original);
  await writeFile(path.join(root, "pnpm-lock.yaml"), `patchedDependencies:\n  expo-widgets@58.0.18: ${hash(original)}\nimporters:\n  apps/mobile:\n    dependencies:\n      expo-widgets:\n        version: 58.0.18(patch_hash=${hash(original)})\nsnapshots:\n  expo-widgets@58.0.18(patch_hash=${hash(original)}): {}\n`);
  return root;
}

const adapt = (root) => execFileSync(process.execPath, [script, root], { encoding: "utf8", stdio: "pipe" });

test("serialized native patch retains unindented file headers for pnpm", async () => {
  const content = await readFile(new URL("../patches/expo-widgets-58.0.18-peek-imports.patch", import.meta.url), "utf8");
  const serialized = JSON.parse(JSON.stringify({ content })).content;
  // git apply accepts indented diff headers; pnpm treats them as hunk lines.
  assert.doesNotMatch(serialized, /^[ \t]+diff --git /m);
  assert.equal((serialized.match(/^diff --git /gm) ?? []).length, 3);
  assert.equal((serialized.match(/^\+import io\.github\.expo\.peek\./gm) ?? []).length, 6);
  assert.ok(serialized.endsWith("\n"));
});

test("the install adapter preserves upstream fixes and repairs all six notification imports", async (t) => {
  const root = await fixture(t);
  adapt(root);
  const patch = await readFile(path.join(root, packagePatch), "utf8");
  assert.ok(patch.startsWith(original));
  const lock = await readFile(path.join(root, "pnpm-lock.yaml"), "utf8");
  assert.ok(!lock.includes(hash(original)));
  assert.equal(lock.split(hash(patch)).length - 1, 3);

  // Reproduce the import blocks and line numbers from the failed compiler run.
  // Apply the actual composed package patch, retaining unrelated file contents.
  const directory = "android/src/main/java/expo/modules/widgets/notifications";
  await mkdir(path.join(root, directory), { recursive: true });
  const cases = [
    ["CustomNotificationBuilder.kt", 17, ["notification.PeekNotificationViews", "notification.setPeekContent"]],
    ["CustomNotificationRenderer.kt", 11, ["emittables.peekEmittableNotificationViews", "notification.PeekNotificationSizes", "notification.PeekNotificationViews"]],
    ["CustomNotifications.kt", 6, ["notification.PeekNotificationViews"]],
  ];
  await writeFile(path.join(root, "keep.txt"), "before\n");
  for (const [name, line, symbols] of cases) {
    const prefix = "// preserved\n".repeat(line - 1);
    await writeFile(path.join(root, directory, name), prefix + symbols.map((symbol) => `import io.github.jakex7.peek.${symbol}\n`).join("") + "// body preserved\n");
  }
  execFileSync("git", ["apply", "--unidiff-zero", packagePatch], { cwd: root });
  assert.equal(await readFile(path.join(root, "keep.txt"), "utf8"), "upstream fix\n");
  for (const [name, line, symbols] of cases) {
    const result = await readFile(path.join(root, directory, name), "utf8");
    assert.equal(result, "// preserved\n".repeat(line - 1) + symbols.map((symbol) => `import io.github.expo.peek.${symbol}\n`).join("") + "// body preserved\n");
  }
  adapt(root);
  assert.equal(await readFile(path.join(root, packagePatch), "utf8"), patch);
  assert.equal(await readFile(path.join(root, "pnpm-lock.yaml"), "utf8"), lock);
});

test("a later widgets release does not inherit the version-specific patch", async (t) => {
  const root = await fixture(t, "58.0.19");
  const lock = await readFile(path.join(root, "pnpm-lock.yaml"), "utf8");
  adapt(root);
  assert.equal(await readFile(path.join(root, packagePatch), "utf8"), original);
  assert.equal(await readFile(path.join(root, "pnpm-lock.yaml"), "utf8"), lock);
});

test("inconsistent upstream patch metadata fails before changing inputs", async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, "pnpm-lock.yaml"), "patchedDependencies: {}\n");
  assert.throws(() => adapt(root), /patch hash/);
  assert.equal(await readFile(path.join(root, packagePatch), "utf8"), original);
});
