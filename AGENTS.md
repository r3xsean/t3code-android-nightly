# T3 Code Android Nightly Companion

This repository builds an unofficial, side-by-side Android companion for Sean
from the newest official `pingdotgg/t3code` nightly. The core is
**want-it-to-work**: a broken release is inconvenient, while a compromised
signing path can silently replace the installed application.

## Contract

- Read `specs/zero-touch-nightly.md` before changing detection, identity,
  signing, versioning, publication, or update behavior.
- Build only the immutable commit resolved from a qualifying official upstream
  release. Never substitute `main`, another mutable ref, or a caller-provided
  repository.
- Preserve application ID `dev.r3xsean.t3code.nightly`. Changing it creates a
  different Android app and discards the in-place update path.
- Signing keys and passwords belong only in GitHub Actions secrets and the
  encrypted recovery backup. If a task would print, commit, replace, or broaden
  access to them, stop and report the risk.
- Secret-bearing jobs must never run on `pull_request`, check out untrusted
  source, or follow a build job on the same runner.
- Upstream source adaptation is fail-closed: when the expected config shape
  changes, fail the build and update the adapter deliberately.

## Working commands

- Run builder tests: `npm test`
- Validate workflow syntax when available: `actionlint`
- Trigger a live tracer build:
  `gh workflow run android-nightly.yml --repo r3xsean/t3code-android-nightly`
- Inspect the latest run:
  `gh run view --repo r3xsean/t3code-android-nightly`

## Completion

Static tests are necessary but not sufficient. Any change touching the delivery
path is complete only after a GitHub-hosted run proves the selected path: an APK
must pass package, version, checksum, and persistent-certificate checks; an OTA
must publish a pre-exported bundle to the dedicated runtime and channel without
checking out upstream source in the credential-bearing job. A failed run must
leave the prior public release and processed-state marker unchanged.

Follow Sean's doctrine at `~/doctrine/AGENTS.md` for project work.
