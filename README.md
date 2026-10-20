# T3 Code Android Nightly Companion — retired

> **Retired on October 21, 2026.** Sean has switched to the official Android
> app and confirmed it works. This companion no longer receives APK or OTA
> updates. Use the Android APK attached to an official
> [T3 Code Nightly release](https://github.com/pingdotgg/t3code/releases), or
> the [official Google Play app](https://play.google.com/store/apps/details?id=com.t3tools.t3code).
>
> The Mac dispatcher and automatic repair LaunchAgents have been disabled and
> unloaded, with their installed plists moved out of `~/Library/LaunchAgents`.
> All four GitHub workflows and repository Actions have been disabled. The
> repository is archived. Existing releases, source history, Expo updates, and
> the encrypted signing recovery backup are retained for reference and recovery.
>
> The documentation below describes the former system. Do not reinstall its
> automation or use the old companion for new installations.

An unofficial, side-by-side Android build of
[T3 Code](https://github.com/pingdotgg/t3code), tracking the newest official
nightly release so it stays compatible with the desktop nightly RPC protocol.

The companion:

- installs as `dev.r3xsean.t3code.nightly`, alongside the Play Store app;
- works with direct LAN or Tailscale environment pairing;
- supports T3 Connect using validated public production identifiers;
- is built from the exact commit recorded by an official upstream nightly;
- receives JavaScript-only nightlies through its dedicated Expo Updates
  channel;
- falls back automatically to a signed APK when Android native compatibility
  changes;
- is signed consistently so Android can upgrade it in place;
- is published with its source commit, certificate fingerprint, metadata, and
  SHA-256 checksum.

## Moving to the official app

The official app uses `com.t3tools.t3code`; the retired companion uses
`dev.r3xsean.t3code.nightly`. They can coexist, but the official app does not
replace the companion in place or inherit its app-local settings. Sign in and
connect to the same host in the official app before removing the companion.

For Obtainium, add `https://github.com/pingdotgg/t3code` as a new entry, include
prereleases, filter release titles with `^T3 Code Nightly `, and filter APK links
with `^t3code-android-internal-.*\.apk$`. Disable reconciliation with the OS
version string: the mobile app version differs from the desktop release tag.
After confirming the official app works, remove the old companion's Obtainium
entry and uninstall **T3 Code Nightly** (`dev.r3xsean.t3code.nightly`).

The companion's published APK was missing the Firebase configuration required
for Android push registration. Its startup smoke tests did not verify push.
The official APK includes that configuration; notifications also require T3
Connect sign-in, a linked host with activity publishing enabled, and device
notification permission.

## Historical implementation

## Security boundary

The workflow accepts only nightly release records from `pingdotgg/t3code`,
checks out their resolved commit SHA, builds on GitHub-hosted Linux runners, and
either exports a static update bundle or passes the unsigned APK to a separate
trusted signing job. Upstream code never runs on a runner holding the Expo token
or signing key. The trusted Expo job publishes only a pre-exported static
bundle; APK publication happens only after package, signature, and checksum
verification. Failed delivery leaves the previous release and processed state
untouched. After a successful delivery, the workflow deletes its temporary
Actions artifacts. APKs, checksums, and provenance attached to GitHub Releases
remain available to Obtainium.

Native builds also check the actual Gradle release dependency graph against
React Native's own fbjni version catalog. An override is added to the generated
project only when those versions differ. When upstream already resolves the
correct version, the check makes no changes. The required native contract is
part of the Expo runtime fingerprint, keeping repaired APKs separate from an
older incompatible native base.

Before signing/publication, the actual ARM64 build must render app UI and stay
alive through two offline cold launches in an Android emulator. Launch logs and
screenshots remain as Actions artifacts for seven days. A launch failure blocks
publication and processed-state advancement, just like a compilation failure.
This smoke test catches startup crashes; it does not certify every feature or
replace testing an upgrade with real phone data.
On GitHub's x86 emulator, Android's ARM translation makes SoLoader choose the
wrong direct-APK ABI path. The harness stages the APK's unchanged ARM64 library
bytes in its installed app-library directory in the disposable emulator. It
does not modify the APK. This exercises native startup, not every phone's
installer behavior; recovery releases are also checked on native ARM64 locally.
The manual `Check existing APK launch` workflow verifies the known broken
.2318 fails and a selected own-repository build artifact passes, without
signing, publishing, or changing delivery state.

Expo OTA updates are a second delivery trust root: they are authorized by the
dedicated Expo account token and delivered over TLS, rather than authenticated
by the APK signing certificate. The credential-bearing publisher installs the
exact EAS CLI dependency tree recorded in `package-lock.json` and never executes
upstream source. EAS analytics and crash-reporting endpoints are explicitly
disabled in the token-bearing publication step.

The local macOS LaunchAgent polls every five minutes while the Mac is online and
dispatches the workflow for a newer official nightly. It lives outside the T3
Code application, so desktop nightly updates and reboots do not replace it.
Build runners start after the Mac finds a new nightly. A failed nightly is attempted no more than three times;
after that, the dispatcher waits for a newer nightly instead of creating an
endless retry loop.

## Automatic recovery

A separate Mac LaunchAgent checks every 15 minutes for failed or overdue
delivery. It uses the signed-in Codex CLI with **GPT-6 Astra, high effort** to
investigate in a disposable checkout and propose a repair. The agent can change
any builder file, dependencies, build logic, or upstream adaptations; there is
no compatibility-file allowlist. A second Astra session reviews the proposal.

GitHub then runs `Verify Android repair` from the pre-repair main commit, tests
the candidate against the original regression suite plus new tests, compiles
an APK, and verifies its package/version, architecture, Expo configuration, and
T3 Connect configuration and two emulator cold launches in a fresh job. Candidate workflow changes cannot
alter that verification run. Only that exact verified commit can fast-forward
main, after which normal signed publication is dispatched. A main-branch
change during verification requires another attempt rather than a stale merge.

Install the worker with `bash scripts/install-dispatcher.sh repair`. Its
dedicated runner clone refreshes on each tick without touching a working
checkout. Failed repairs retry with exponential backoff from 15 minutes to six
hours, without a hard per-nightly or daily attempt cutoff. Each agent session
has a 30-minute timeout. State, diagnosis, and pending build
information survive restarts under
`~/Library/Application Support/T3CodeNightly/`. The Mac must be awake and Codex
must remain signed in with usage available. Repaired source is verified and
built on GitHub, where signing and Expo credentials already live.

`Android delivery health` also runs independently on GitHub after main builds
and every six hours. It opens one recovery issue after a failed build or six
hours of undelivered nightlies, updates it without creating duplicate issues,
and closes it when the delivered state catches up. This also detects an offline
Mac. Automatic repair cannot guarantee recovery from every future upstream
change; a failed repair leaves the last working release available and the
incident open.

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
