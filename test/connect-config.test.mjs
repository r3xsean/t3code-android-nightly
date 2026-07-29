import test from "node:test";
import assert from "node:assert/strict";

import {
  githubEnvPayload,
  resolveConnectPublicConfig,
  verifyBundle,
  verifyExpoConfig,
} from "../scripts/connect-config.mjs";

const publicConfig = {
  T3CODE_CLERK_PUBLISHABLE_KEY: `pk_live_${Buffer.from(
    "clerk.t3.codes$",
  ).toString("base64url")}`,
  T3CODE_CLERK_JWT_TEMPLATE: "t3-relay",
  T3CODE_RELAY_URL: "https://relay.t3.codes",
};

const resolvedConfig = {
  extra: {
    clerk: {
      publishableKey: publicConfig.T3CODE_CLERK_PUBLISHABLE_KEY,
      jwtTemplate: publicConfig.T3CODE_CLERK_JWT_TEMPLATE,
    },
    relay: {
      url: publicConfig.T3CODE_RELAY_URL,
    },
  },
};

test("accepts only T3's production Connect trust targets", () => {
  assert.deepEqual(resolveConnectPublicConfig(publicConfig), publicConfig);
  assert.throws(
    () =>
      resolveConnectPublicConfig({
        ...publicConfig,
        T3CODE_RELAY_URL: "https://unexpected.example",
      }),
    /production relay/,
  );
  assert.throws(
    () =>
      resolveConnectPublicConfig({
        ...publicConfig,
        T3CODE_CLERK_PUBLISHABLE_KEY: `pk_live_${Buffer.from(
          "untrusted$",
        ).toString("base64url")}`,
      }),
    /production Clerk host/,
  );
});

test("exports the public identifiers through GitHub Actions", () => {
  const payload = githubEnvPayload(publicConfig);
  for (const [name, value] of Object.entries(publicConfig)) {
    assert.match(payload, new RegExp(`^${name}=${value}$`, "m"));
  }
});

test("accepts an Expo config with T3 Connect enabled", () => {
  assert.doesNotThrow(() => verifyExpoConfig(resolvedConfig, publicConfig));
});

test("fails closed when an Expo public identifier is absent or changed", () => {
  assert.throws(
    () =>
      verifyExpoConfig(
        {
          ...resolvedConfig,
          extra: {
            ...resolvedConfig.extra,
            relay: { url: "https://unexpected.example" },
          },
        },
        publicConfig,
      ),
    /unexpected T3CODE_RELAY_URL/,
  );
  assert.throws(() => verifyExpoConfig({}, publicConfig), /unexpected/);
});

test("proves all public identifiers reached the decoded Hermes bundle", () => {
  const bundle = Buffer.from(Object.values(publicConfig).join("\0"));
  assert.doesNotThrow(() => verifyBundle(bundle, publicConfig));
  assert.throws(
    () =>
      verifyBundle(
        Buffer.from("bundle without Connect config"),
        publicConfig,
      ),
    /does not contain/,
  );
});
