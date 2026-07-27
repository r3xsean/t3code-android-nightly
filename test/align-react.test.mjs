import assert from "node:assert/strict";
import test from "node:test";

import {
  alignMobileReactDependencies,
  readRendererReactVersion,
} from "../scripts/align-react.mjs";

test("reads the exact React version embedded in the React Native renderer", () => {
  const renderer = `
    if ("19.2.3" !== isomorphicReactPackageVersion)
      throw Error("Incompatible React versions");
  `;

  assert.equal(readRendererReactVersion(renderer), "19.2.3");
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
