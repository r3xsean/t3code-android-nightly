import assert from "node:assert/strict";
import test from "node:test";
import { readRendererReactVersion } from "../scripts/align-react.mjs";

for (const secondVersion of ["19.1.0", "19.2.0"]) {
  test(`rejects duplicate renderer metadata: 19.1.0 and ${secondVersion}`, () => {
    const source = `
      const first = {
        version: "19.1.0",
        rendererPackageName: "react-native-renderer",
      };
      const second = {
        version: '${secondVersion}',
        rendererPackageName: 'react-native-renderer',
      };
    `;

    assert.throws(
      () => readRendererReactVersion(source),
      {
        name: "Error",
        message: "Expected an unambiguous React version compatibility guard or renderer metadata in the React Native renderer",
      },
    );
  });
}

for (const version of ["19.1.0", "19.2.0-canary-abc123.1"]) {
  test(`accepts agreeing legacy guard and modern metadata for ${version}`, () => {
    const source = `
      if ("${version}" !== isomorphicReactPackageVersion) {
        throw new Error("Incompatible React version");
      }
      const renderer = {
        version: '${version}',
        rendererPackageName: 'react-native-renderer',
      };
    `;

    assert.equal(readRendererReactVersion(source), version);
  });
}
