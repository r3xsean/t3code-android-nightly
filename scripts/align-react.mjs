import { readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const MOBILE_PACKAGE_RELATIVE_PATH = path.join(
  "apps",
  "mobile",
  "package.json",
);

export function readRendererReactVersion(rendererSource) {
  const matches = [
    ...rendererSource.matchAll(
      /if\s*\(\s*"(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)"\s*!==\s*isomorphicReactPackageVersion\s*\)/g,
    ),
  ];
  const metadata = [...rendererSource.matchAll(
    /version:\s*["'](\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)["']\s*,\s*rendererPackageName:\s*["']react-native-renderer["']/g,
  )];
  const versions = [...matches, ...metadata].map((match) => match[1]);
  if (versions.length === 0 || matches.length > 1 || metadata.length > 1 || new Set(versions).size !== 1) {
    throw new Error(
      "Expected an unambiguous React version compatibility guard or renderer metadata in the React Native renderer",
    );
  }
  return versions[0];
}

export async function installedRendererVersion(packagePath) {
  const require = createRequire(path.resolve(packagePath));
  const nativePackagePath = require.resolve("react-native/package.json");
  const nativePackage = JSON.parse(await readFile(nativePackagePath, "utf8"));
  const directory = path.join(path.dirname(nativePackagePath), "Libraries", "Renderer", "implementations");
  const names = (await readdir(directory)).filter((name) => /^React.*-prod\.js$/.test(name)).sort();
  if (!names.length) throw new Error(`React Native ${nativePackage.version}: no production renderers found in ${directory}`);
  const versions = await Promise.all(names.map(async (name) => {
    try {
      return readRendererReactVersion(await readFile(path.join(directory, name), "utf8"));
    } catch (error) {
      throw new Error(`React Native ${nativePackage.version}, ${name}: ${error.message}`);
    }
  }));
  if (new Set(versions).size !== 1) throw new Error(`React Native ${nativePackage.version}: conflicting renderer React versions: ${versions.join(", ")}`);
  return versions[0];
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

  const packagePath = path.join(sourceRoot, MOBILE_PACKAGE_RELATIVE_PATH);
  const rendererVersion = await installedRendererVersion(packagePath);
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));

  if (mode === "--check") {
    const installedReact = JSON.parse(
      await readFile(
        createRequire(path.resolve(packagePath)).resolve("react/package.json"),
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
