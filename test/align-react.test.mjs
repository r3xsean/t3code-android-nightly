import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  alignMobileReactDependencies,
  readRendererReactVersion,
  installedRendererVersion,
} from "../scripts/align-react.mjs";

test("reads the exact React version embedded in the React Native renderer", () => {
  const renderer = `
    if ("19.2.3" !== isomorphicReactPackageVersion)
      throw Error("Incompatible React versions");
  `;

  assert.equal(readRendererReactVersion(renderer), "19.2.3");
});

test("supports Fabric-only React Native 0.86 metadata after the legacy guard was removed", () => {
  assert.equal(readRendererReactVersion('version: "19.2.3", rendererPackageName: "react-native-renderer",'), "19.2.3");
});

test("does not accept inconsistent guard and renderer metadata", () => {
  assert.throws(() => readRendererReactVersion('if ("19.2.3" !== isomorphicReactPackageVersion) {} version: "19.3.0", rendererPackageName: "react-native-renderer",'), /unambiguous/);
});

test("discovers Fabric-only and hoisted installations; refuses conflicting production renderers", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "t3-renderer-"));
  try {
    const mobile = path.join(root, "apps/mobile");
    const native = path.join(root, "node_modules/react-native");
    const renderers = path.join(native, "Libraries/Renderer/implementations");
    await mkdir(mobile, { recursive: true });
    await mkdir(renderers, { recursive: true });
    await writeFile(path.join(mobile, "package.json"), '{}');
    await writeFile(path.join(native, "package.json"), JSON.stringify({ name: "react-native", version: "0.86.3" }));
    await writeFile(path.join(renderers, "ReactFabric-prod.js"), 'version: "19.2.3", rendererPackageName: "react-native-renderer",');
    assert.equal(await installedRendererVersion(path.join(mobile, "package.json")), "19.2.3");
    await writeFile(path.join(renderers, "ReactNativeRenderer-prod.js"), 'if ("19.3.0" !== isomorphicReactPackageVersion) {}');
    await assert.rejects(installedRendererVersion(path.join(mobile, "package.json")), /conflicting/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("aligns React and React DOM to the renderer version", () => {
  const packageJson = {
    dependencies: {
      react: "19.2.6",
      "react-dom": "19.2.6",
      "react-native": "0.85.3",
    },
  };

  const aligned = alignMobileReactDependencies(packageJson, "19.2.3");

  assert.equal(aligned.dependencies.react, "19.2.3");
  assert.equal(aligned.dependencies["react-dom"], "19.2.3");
  assert.equal(aligned.dependencies["react-native"], "0.85.3");
});

test("rejects a renderer without an exact compatibility guard", () => {
  assert.throws(
    () => readRendererReactVersion("export const version = '19.2.3';"),
    /compatibility guard/,
  );
});
