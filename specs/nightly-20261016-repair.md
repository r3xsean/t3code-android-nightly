# October 16 nightly repair

Base: f0a83f818752da305b2d58ea0df395270957f18d.
Upstream: 9b150f791b8d3c8b284c3c701d2c1ef8aa14df45.

## Acceptance contract

Restore preparation and native compilation of v0.1.1-nightly.20261016.3190.
Preserve companion identity, neutral fingerprint versioning, widgets,
notifications, upstream patches, and the production build and verification gates.
Return a proposal; the controller owns verification and publication.

## Tickets

- R1: Accept the observed environment-backed upstream version expression as
  well as literal versions. Normalize before fingerprinting and finalize to
  the requested nightly. Reject unknown or duplicate version declarations.
- R2: Repair expo-widgets 58.0.18 notification imports to match its existing
  Expo Peek dependency. Apply durably through pnpm before installation in both
  production and repair builds, preserving upstream patches and frozen-lockfile
  consistency. Repeated adaptation must be harmless; inconsistent inputs fail.
- R3: Run builder regressions and exercise preparation against the supplied
  upstream source. Verify the exact serialized patch through pnpm 11.10.0,
  including a frozen reinstall and the previously malformed payload as a
  negative control. Leave APK compilation and launch verification to the
  independent controller workflow.

## Implementation Notes

Test seams: config preparation/finalization (mechanical); upstream adaptation
CLI and resulting package patch/lockfile consumed by installation (mechanical);
independent release APK compile and launch (behavioral). No experiential changes.

The native failure reports obsolete `io.github.jakex7.peek` imports, while
expo-widgets declares `io.github.expo.peek:peek-emittables:0.3.2`. Expo Peek's
notification and emittables modules use the `io.github.expo.peek` namespace.
Compose a version-specific patch with upstream's existing pnpm patch and update
its SHA-256 lockfile references before either build installs dependencies.

Sources:
- [Widget dependency](https://raw.githubusercontent.com/expo/expo/main/packages/expo-widgets/android/build.gradle)
- [Notification namespace](https://raw.githubusercontent.com/expo/peek/main/peek-notification/build.gradle.kts)
- [Emittables namespace and notification API dependency](https://raw.githubusercontent.com/expo/peek/main/peek-emittables/build.gradle.kts)

R1 and R2 are implemented and locally checked. R3 local checks passed; the
controller's independent APK compilation and launch checks remain pending.

Evidence:
- All 121 builder tests pass, including the original suite and six new tests.
- Exact supplied upstream inputs pass patch composition, all four lock hash
  replacements, repeated adaptation, neutral versioning, and final identity.
- The proposal was serialized to JSON and reconstructed in a fresh directory.
  Its adapter composed the exact supplied upstream patch and repaired all four
  lockfile hash references. An offline synthetic package install with production
  pnpm 11.10.0 applied that composed patch, and a fresh frozen-lockfile reinstall
  succeeded. All six installed notification imports use the Expo namespace.
  Synthetic preimages exercise patch application, not Kotlin compilation.
- Reintroducing the two leading spaces from the rejected payload reproduced
  pnpm's `hunk header integrity check failed`. The new permanent regression also
  rejects these spaces; git apply alone accepts them and is insufficient.
- Review found and fixed a duplicate-declaration gap: an unknown version
  expression next to a recognized declaration now fails closed.
- CLI path detection now supports spaces, exercised by the exact-source smoke.
- Production and repair build entrypoints are unchanged; both already invoke
  the adapter before dependency installation. No verifier changes.

### Deviations

The controller's explicit proposal/verification/publication contract replaces
the interactive debrief gate. T3 delegation tools are unavailable, so no
cross-model review can be certified locally. Vite+ is unavailable and shell
network access cannot resolve the package registry; local checks cannot certify
APK compilation or launch. Independent review, APK checks, and publication
remain controller-owned. No signing, publication, or verifier code changed.
