# T3 Code Android Nightly Companion

An unofficial, side-by-side Android build of
[T3 Code](https://github.com/pingdotgg/t3code), produced from each official
nightly release so it stays compatible with the desktop nightly RPC protocol.

The companion:

- installs as `dev.r3xsean.t3code.nightly`, alongside the Play Store app;
- works with direct LAN or Tailscale environment pairing;
- does not include T3 Connect credentials;
- is built from the exact commit recorded by an official upstream nightly;
- is signed consistently so Android can upgrade it in place;
- is published with its source commit, certificate fingerprint, metadata, and
  SHA-256 checksum.

## Install and update

1. Install [Obtainium](https://github.com/ImranR98/Obtainium).
2. Add this repository's GitHub URL as an app source.
3. Enable prerelease inclusion only if Obtainium requests it; companion releases
   are published as normal GitHub releases.
4. Install the APK and allow Obtainium to install unknown apps when Android
   prompts.

Obtainium checks GitHub for future releases and provides the Android update
prompt. Pair this companion separately from the official app.

## Security boundary

The workflow accepts only nightly release records from `pingdotgg/t3code`,
checks out their resolved commit SHA, builds on GitHub-hosted Linux runners, and
publishes only after package, signature, and checksum verification. A failed
build leaves the previous release untouched.

The signing key is not stored in this repository.
The expected public certificate fingerprint and recovery procedure are recorded
in [SIGNING.md](SIGNING.md).

## License

Builder automation is MIT licensed. Generated APKs contain MIT-licensed T3 Code;
see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
