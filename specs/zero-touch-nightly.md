# Zero-touch T3 Code Android nightly companion

## Intent

Give Sean a side-by-side Android client that remains protocol-compatible with
the T3 Code desktop nightly without requiring him to understand GitHub Actions,
Android signing, or source builds.

## User-visible contract

- The first APK installs alongside the official Play Store application.
- The companion pairs directly with a reachable T3 Code environment over LAN or
  Tailscale without private T3 Connect configuration.
- The newest qualifying upstream nightly is automatically built and published;
  superseded nightlies may be skipped after an outage or broken build.
- Obtainium notices a newer release and offers an in-place Android update.
- Pairing and application data survive upgrades.
- Broken builds do not replace the latest published APK.

## Trusted input

Only published prereleases from `pingdotgg/t3code` whose tags match
`v<semver>-nightly.<YYYYMMDD>.<sequence>` qualify. The workflow resolves the
release tag to an immutable commit SHA and builds that SHA.

## Identity and versioning

- Application ID: `dev.r3xsean.t3code.nightly`
- Display name: `T3 Code Nightly`
- Version name: exact upstream tag without its leading `v`
- Version code: upstream publication timestamp as Unix seconds
- GitHub release tag: exactly the Android version name, so Obtainium's latest
  version matches Android's installed version
- Signing: one long-lived PKCS#12 identity stored as GitHub Actions secrets,
  with an encrypted external recovery copy

## Publication

Each downstream release is created as a draft, receives a signed arm64 APK,
checksum, and metadata, then becomes public. Partial publication is cleaned up.
Releases retain their upstream ID, tag, commit SHA, publication time, Android
version, APK checksum, and signing-certificate fingerprint.

## Failure behavior

- Reject malformed, mutable, duplicate, colliding, or non-monotonic inputs.
- Do not publish if dependency installation, native generation, compilation,
  package inspection, signature verification, or tests fail.
- Preserve old releases for recovery.

## Success evidence

1. Builder unit tests pass.
2. A clean GitHub-hosted Linux runner produces the APK without T3 secrets.
3. `apksigner` verifies the intended persistent certificate.
4. `aapt2` reports the intended package, version name, and version code.
5. A public GitHub Release exposes the APK, checksum, and provenance metadata.
6. Android installs the first APK and upgrades to a second without data loss.
7. Obtainium discovers and offers that second version.
