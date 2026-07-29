# T3 Code Android Nightly Companion

An unofficial, side-by-side Android build of
[T3 Code](https://github.com/pingdotgg/t3code), tracking the newest official
nightly release so it stays compatible with the desktop nightly RPC protocol.

The companion:

- installs as `dev.r3xsean.t3code.nightly`, alongside the Play Store app;
- works with direct LAN or Tailscale environment pairing;
- supports T3 Connect using validated public production identifiers;
- is built from the exact commit recorded by an official upstream nightly;
- is signed consistently so Android can upgrade it in place;
- is published with its source commit, certificate fingerprint, metadata, and
  SHA-256 checksum.

## Install and update

This build targets 64-bit ARM Android phones (`arm64-v8a`).

1. Install [Obtainium](https://obtainium.imranr.dev/).
2. On the Android phone, tap
   **[add T3 Code Nightly to Obtainium](https://apps.obtainium.imranr.dev/redirect?r=obtainium://add/https%3A%2F%2Fgithub.com%2Fr3xsean%2Ft3code-android-nightly)**.
3. Confirm the detected GitHub source, then tap **Add** and **Install**.
4. Allow Obtainium to install unknown apps when Android prompts.

Obtainium checks GitHub for future releases and provides the Android update
prompt. Companion releases are normal GitHub releases, so prerelease inclusion
is not required. Each release tag exactly matches the APK version reported by
Android, preventing false update prompts. Pair this companion separately from
the official app.

If the one-tap link does not open Obtainium, paste
`https://github.com/r3xsean/t3code-android-nightly` into Obtainium's **Add App**
screen.

## Security boundary

The workflow accepts only nightly release records from `pingdotgg/t3code`,
checks out their resolved commit SHA, builds on GitHub-hosted Linux runners, and
passes the unsigned APK to a separate trusted signing job. Upstream code never
runs on the signing-key runner. Publication happens only after package,
signature, and checksum verification; a failed build leaves the previous
release untouched. After a successful release, the workflow deletes its
temporary unsigned and signed Actions artifacts. The APK, checksum, and
provenance attached to GitHub Releases are separate and remain available to
Obtainium.

A monthly marker commit keeps GitHub from disabling this public repository's
scheduled workflow after 60 days without repository activity.

The signing key is not stored in this repository.
The expected public certificate fingerprint is recorded in
[SIGNING.md](SIGNING.md).

T3 Connect's Clerk publishable key, JWT template name, and relay URL are public
client identifiers, not signing or account secrets. They are stored as
repository-level Actions variables, restricted to T3's production trust
targets, and checked in Expo's resolved public configuration before native
generation and compilation. See T3's
[Connect configuration documentation](https://github.com/pingdotgg/t3code/blob/main/docs/cloud/t3-connect-clerk.md).

## License

Builder automation is MIT licensed. Generated APKs contain MIT-licensed T3 Code;
see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
