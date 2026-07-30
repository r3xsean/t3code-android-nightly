# Zero-touch T3 Code Android nightly companion

## Intent

Give Sean a side-by-side Android client that remains protocol-compatible with
the T3 Code desktop nightly without requiring him to understand GitHub Actions,
Android signing, Expo Updates, or source builds. Deliver JavaScript-only
nightlies over the air and fall back to a signed APK whenever native
compatibility changes.

## User-visible contract

- The first APK installs alongside the official Play Store application.
- The companion pairs directly with a reachable T3 Code environment over LAN or
  Tailscale.
- The companion exposes T3 Connect account sign-in and environment discovery
  using validated public production identifiers, without private T3
  credentials.
- While the Mac is online, a persistent five-minute dispatcher starts processing
  the newest qualifying upstream nightly without depending on T3 Code itself.
- A compatible JavaScript-only nightly is published to the private companion's
  Expo Updates channel. The app checks for it at launch and applies it on the
  next reload.
- A nightly with a changed Android native fingerprint is built and published as
  a signed APK. Obtainium notices the newer release and offers an in-place
  Android update.
- Superseded nightlies may be skipped after an outage or broken build.
- Pairing and application data survive upgrades.
- Broken builds and failed OTA publications do not advance processed state or
  replace the latest working delivery.

## Trusted input

Only published prereleases from `pingdotgg/t3code` whose tags match
`v<semver>-nightly.<YYYYMMDD>.<sequence>` qualify. The workflow resolves the
release tag to an immutable commit SHA and builds that SHA.

## Identity and versioning

- Application ID: `dev.r3xsean.t3code.nightly`
- Display name: `T3 Code Nightly`
- Expo project: a project owned by Sean and dedicated to this companion
- Expo channel: `nightly`
- Expo runtime version: an explicit Android native-compatibility fingerprint
- APK version name: exact upstream tag without its leading `v`
- Version code: upstream publication timestamp as Unix seconds
- GitHub release tag: exactly the Android version name, so Obtainium's latest
  version matches Android's installed version
- Signing: one long-lived PKCS#12 identity stored as GitHub Actions secrets,
  with an encrypted external recovery copy

## Publication

The untrusted source job checks out and builds the exact upstream commit without
credentials. It computes the Android native fingerprint before assigning the
explicit runtime version. Fingerprinting always uses one neutral version name
and code, so delivery-version changes cannot masquerade as native changes.

- When the fingerprint matches the latest native APK, the untrusted job exports
  a static update bundle. A separate trusted job that never checks out or
  executes upstream source publishes that bundle with the Expo token.
- When the fingerprint differs or no OTA-enabled native base exists, the
  existing isolated signing path produces a new APK. Each downstream release is
  created as a draft, receives the signed arm64 APK, checksum, and metadata,
  then becomes public. Partial publication is cleaned up.

APK releases retain the upstream ID, tag, commit SHA, publication time, Android
version, APK checksum, signing-certificate fingerprint, native fingerprint,
Expo project ID, and channel. Successful OTA and APK deliveries record the
upstream tag as a namespaced repository Git ref only after publication
succeeds. The marker uses the workflow's existing `contents: write` authority
and remains readable without an additional administrative token.

The Expo token and Android signing material must never be present in a job that
checks out or executes upstream source. End-to-end update code signing is not
available on the selected Expo plan; updates rely on Expo account authorization
and TLS, while APK authenticity remains protected by Android signing. The
credential-bearing publisher installs the exact EAS CLI dependency graph from
the builder's lockfile before the token is exposed. On every cold start, Expo
Updates contacts the dedicated Expo endpoint and discloses the companion
project, channel, runtime, and installation identifiers.

## Failure behavior

- Reject malformed, mutable, duplicate, colliding, or non-monotonic inputs.
- Do not publish if dependency installation, native generation, compilation,
  package inspection, signature verification, or tests fail.
- Preserve old releases for recovery.
- If the dispatcher cannot reach GitHub, another workflow is active, or a
  dispatch fails, retain retry state and try again without creating a duplicate.
- Persist dispatch state atomically. Quarantine malformed state instead of
  wedging future checks.
- Attempt one upstream nightly at most three times. If all attempts fail, wait
  for a newer nightly rather than repeatedly exercising credential-bearing
  publication jobs.

## Automation decision

Sean explicitly selected unattended nightly delivery so that the phone remains
current without manual GitHub work. This is a deliberate exception to the
doctrine preference for a human gate before public mutations. Its compensating
controls are immutable upstream inputs, a dedicated companion identity and Expo
project, isolated credentials, fail-closed validation, at most three attempts
per nightly, and preservation of the last working delivery. The automation must
not publish to T3's repositories, the Play Store, or the official application
identity.

## Success evidence

1. Builder unit tests pass.
2. Expo's resolved public configuration contains the dedicated project ID,
   update URL, `nightly` channel, explicit runtime fingerprint, companion
   package ID, and enabled launch checking.
3. A compatible fixture chooses OTA and an incompatible or unbootstrapped
   fixture chooses APK.
4. A clean GitHub-hosted Linux runner exports an OTA bundle or produces an APK
   without T3, Expo, or signing secrets.
5. The trusted OTA job publishes a pre-exported bundle without checking out or
   executing upstream source.
6. `apksigner` verifies the intended persistent certificate.
7. `aapt2` reports the intended package, version name, and version code.
8. A public GitHub Release exposes each required APK, checksum, and provenance
   metadata.
9. Android installs the OTA-enabled bootstrap APK and preserves pairing through
   both an OTA update and a later APK upgrade.
10. Obtainium discovers and offers the later native APK version.
11. The launch agent survives logout/login cycles, reboot after the user logs
    back in, and T3 Code nightly replacement. It dispatches at most one active
    workflow for an unpublished upstream tag, with no more than three total
    attempts for a failing tag.
12. Before native generation, Expo's resolved public configuration contains the
   configured T3 Connect identifiers, restricted to T3's production Clerk host,
   JWT template, and relay.

## Tickets

### T1 — Native compatibility and companion configuration

Add fail-closed source transformations for the companion identity, Expo project,
launch update behavior, channel, runtime, and JavaScript-visible nightly
version. Add pure compatibility-fingerprint parsing and delivery-decision
tests.

### T2 — Isolated hybrid publication workflow

Refactor the workflow into an untrusted prepare/export-or-build job, an isolated
APK signing and release path, and an isolated Expo publication path. Persist
processed state only after the selected publication path succeeds. Include
native and Expo provenance in APK metadata and release markers.

Blocked by: T1.

### T3 — Persistent macOS dispatcher

Add a tested dispatcher with duplicate suppression and bounded retry behavior,
plus an idempotent installer for a user LaunchAgent that runs every five
minutes independently of the T3 Code application.

### T4 — Provision and prove the delivery loop

Create the dedicated Expo project and `nightly` channel, install repository
variables and the Expo token, install the LaunchAgent, publish the OTA-enabled
bootstrap APK, exercise one compatible OTA tracer and one native-fallback
decision, and verify the phone-facing update path.

Blocked by: T1, T2, T3.

## Implementation notes

- Native delivery selection is a mechanical seam: compare the generated Android
  fingerprint to the latest published OTA-enabled native base. Generate every
  fingerprint from the same neutral version name and code.
- Upstream source adaptation is a mechanical, fail-closed seam: every expected
  insertion point must occur exactly once.
- Secret isolation and publication-state advancement are behavioral seams:
  workflow structure and failure paths must prove that untrusted source cannot
  access credentials and failed deliveries cannot be marked processed.
- Dispatcher eligibility, duplicate suppression, and retry timing are
  behavioral seams tested without invoking GitHub or `launchctl`.
- Actual Android launch/reload behavior is experiential and requires a
  user-visible hand pass after automated configuration and publication checks.
- Blast radius is high because the workflow publishes external updates and
  signed binaries. Live tracers use the dedicated companion project and channel,
  immutable upstream commits, and reversible branch-scoped workflow runs before
  any main-branch handoff.
