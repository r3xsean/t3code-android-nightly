import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const RENDERER_RELATIVE_PATH = path.join(
  "apps",
  "mobile",
  "node_modules",
  "react-native",
  "Libraries",
  "Renderer",
  "implementations",
  "ReactNativeRenderer-prod.js",
);
const MOBILE_PACKAGE_RELATIVE_PATH = path.join(
  "apps",
  "mobile",
  "package.json",
);
const INSTALLED_REACT_RELATIVE_PATH = path.join(
  "apps",
  "mobile",
  "node_modules",
  "react",
  "package.json",
);

export function readRendererReactVersion(rendererSource) {
  const matches = [
    ...rendererSource.matchAll(
      /if\s*\(\s*"(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)"\s*!==\s*isomorphicReactPackageVersion\s*\)/g,
    ),
  ];
  if (matches.length !== 1) {
    throw new Error(
      "Expected exactly one React version compatibility guard in the React Native renderer",
    );
  }
  return matches[0][1];
}

export function alignMobileReactDependencies(packageJson, rendererVersion) {
  if (!packageJson.dependencies) {
    throw new Error("Mobile package has no dependencies");
  }
  for (const dependency of ["react", "react-dom"]) {
    if (!(dependency in packageJson.dependencies)) {
      throw new Error(`Mobile package has no ${dependency} dependency`);
    }
    packageJson.dependencies[dependency] = rendererVersion;
  }
  return packageJson;
}

async function main() {
  const [sourceRoot, mode] = process.argv.slice(2);
  if (!sourceRoot || (mode && mode !== "--check")) {
    throw new Error("Usage: align-react.mjs <source-root> [--check]");
  }

  const rendererSource = await readFile(
    path.join(sourceRoot, RENDERER_RELATIVE_PATH),
    "utf8",
  );
  const rendererVersion = readRendererReactVersion(rendererSource);
  const packagePath = path.join(sourceRoot, MOBILE_PACKAGE_RELATIVE_PATH);
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));

  if (mode === "--check") {
    const installedReact = JSON.parse(
      await readFile(
        path.join(sourceRoot, INSTALLED_REACT_RELATIVE_PATH),
        "utf8",
      ),
    );
    for (const [label, version] of [
      ["declared react", packageJson.dependencies?.react],
      ["declared react-dom", packageJson.dependencies?.["react-dom"]],
      ["installed react", installedReact.version],
    ]) {
      if (version !== rendererVersion) {
        throw new Error(
          `${label} ${version ?? "(missing)"} does not match React Native renderer ${rendererVersion}`,
        );
      }
    }
    console.log(`React alignment verified at ${rendererVersion}`);
    return;
  }

  alignMobileReactDependencies(packageJson, rendererVersion);
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  console.log(`Aligned mobile React dependencies to ${rendererVersion}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
