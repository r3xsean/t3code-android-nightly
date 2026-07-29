import { appendFile, readFile } from "node:fs/promises";

export const CONNECT_ENV_NAMES = Object.freeze([
  "T3CODE_CLERK_PUBLISHABLE_KEY",
  "T3CODE_CLERK_JWT_TEMPLATE",
  "T3CODE_RELAY_URL",
]);

const EXPO_PATHS = Object.freeze({
  T3CODE_CLERK_PUBLISHABLE_KEY: ["extra", "clerk", "publishableKey"],
  T3CODE_CLERK_JWT_TEMPLATE: ["extra", "clerk", "jwtTemplate"],
  T3CODE_RELAY_URL: ["extra", "relay", "url"],
});

function valueAtPath(value, path) {
  return path.reduce(
    (current, segment) =>
      current && typeof current === "object" ? current[segment] : undefined,
    value,
  );
}

export function resolveConnectPublicConfig(env = process.env) {
  const config = Object.fromEntries(
    CONNECT_ENV_NAMES.map((name) => [name, env[name]?.trim()]),
  );
  for (const [name, value] of Object.entries(config)) {
    if (!value) {
      throw new Error(`Missing GitHub Actions variable ${name}`);
    }
  }

  const encodedClerkHost =
    config.T3CODE_CLERK_PUBLISHABLE_KEY.match(/^pk_live_([A-Za-z0-9_-]+)$/)?.[1];
  let clerkHost;
  try {
    clerkHost = Buffer.from(encodedClerkHost ?? "", "base64url").toString(
      "utf8",
    );
  } catch {
    clerkHost = "";
  }
  if (clerkHost !== "clerk.t3.codes$") {
    throw new Error(
      "T3CODE_CLERK_PUBLISHABLE_KEY does not target T3's production Clerk host",
    );
  }
  if (config.T3CODE_CLERK_JWT_TEMPLATE !== "t3-relay") {
    throw new Error(
      "T3CODE_CLERK_JWT_TEMPLATE does not target T3's relay template",
    );
  }
  if (config.T3CODE_RELAY_URL !== "https://relay.t3.codes") {
    throw new Error("T3CODE_RELAY_URL does not target T3's production relay");
  }
  return Object.freeze(config);
}

export function githubEnvPayload(config = resolveConnectPublicConfig()) {
  return `${Object.entries(config)
    .map(([name, value]) => `${name}=${value}`)
    .join("\n")}\n`;
}

export function verifyExpoConfig(
  config,
  expected = resolveConnectPublicConfig(),
) {
  for (const [name, path] of Object.entries(EXPO_PATHS)) {
    const actual = valueAtPath(config, path);
    if (actual !== expected[name]) {
      throw new Error(
        `Resolved Expo config has an unexpected ${name}; expected the configured T3 Connect public identifier`,
      );
    }
  }
}

async function main() {
  const [command, filePath] = process.argv.slice(2);
  if (!command || !filePath) {
    throw new Error(
      "Usage: connect-config.mjs <--emit-github-env|--verify-expo> <path>",
    );
  }

  if (command === "--emit-github-env") {
    await appendFile(filePath, githubEnvPayload(), "utf8");
    return;
  }

  if (command === "--verify-expo") {
    verifyExpoConfig(JSON.parse(await readFile(filePath, "utf8")));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
