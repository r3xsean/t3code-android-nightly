# Native Android launch recovery

Fix and publish an in-place replacement for crashing nightly .2318. Preserve
the companion package, signing identity, pairing data, and existing OTA flow.
Blast radius: high (public APK delivery).

## Acceptance contract

1. Resolve the fbjni version required by the installed React Native package,
   not a permanently hardcoded 0.7.0. Inspect Gradle's actual release graph after
   Expo prebuild. Only force that version if the graph selects a different one;
   if upstream already resolves it correctly, make no Gradle source changes.
   Recheck the graph after any intervention and fail closed on unknown inputs.
2. Include this native compatibility contract in the runtime fingerprint so
   repaired APKs cannot share OTA compatibility with the broken native base.
3. Every native publication and independent repair verification must launch
   the exact arm64 APK in an isolated Android emulator before passing. Require
   rendered non-splash app UI, a stable foreground process, no fatal crash, and
   a second cold launch. Do not pass merely because installation succeeds.
4. The published .2318 must fail the launch check. The replacement must pass
   it both on GitHub and the local ARM64 emulator. Publication follows these
   checks, and the release has a newer Android version code for Obtainium.
5. Future failures in the launch gate fail the normal build/delivery workflow,
   leaving processed state unchanged and becoming visible to existing repair
   automation. Do not add an unconditional stale dependency pin.

## Tickets

- T1: Complete — conditional resolved-native-dependency guard and runtime isolation.
- T2: Complete — exact-artifact launch gate for native publication and repair verification.
- T3: Complete — live negative/positive verification and signed recovery publication.

## Implementation Notes

- Baseline: 1bdce246bca8c9882a964cd707e8d19f1f2aff9a.
- Mechanical seams: parsing React Native's version catalog; resolved graph
  decision/no-op behavior; deterministic ABI-aware runtime fingerprint.
- Behavioral seams: real Gradle graph before/after conditional intervention;
  emulator process/UI/crash observations; publication dependency graph.
- Experiential hand-pass: Sean installs the replacement and confirms his
  existing connection still works. This is not claimed by automated tests.
- The user explicitly authorized publication. No additional merge/debrief
  approval gate is required for this recovery.
- Cloud execution revealed a SoLoader/NativeBridge limitation: an ARM64-only
  APK is searched under lib/x86_64. The cloud harness therefore stages unchanged
  APK library bytes into the emulator's installed app-library directory, with
  emulator-only/root/path guards. This is a test-environment adaptation, not an
  APK patch. It is validated against both the broken original and replacement.
  Cloud packaging fidelity is consequently limited; local native ARM64 launch
  validation uses the unmodified installation path. This limitation is explicit.
- Verification: 115 unit tests and the real Gradle composite fixture pass.
  Build run 36466265256 compiled .2375 after verifying fbjni 0.8.1 -> 0.7.0.
  Its artifact passes both native ARM64 cold launches locally. Diagnostic run
  36470273097 independently rejects the checksum-pinned broken .2318 APK and
  passes the same repaired artifact twice on the translated cloud emulator.
  A real Gradle/Maven fixture proves both the conditional mismatch repair and
  byte-for-byte no-op on subsequent/already-correct resolution.
- Final production run [36471110757](https://github.com/r3xsean/t3code-android-nightly/actions/runs/36471110757)
  succeeded from builder af3d849e88fd667c52ff4df09e282d5695b054c0.
  New upstream .2402 arrived during verification, so the final recovery uses
  immutable source ed57bed8e71b2e89a9350c94bda0dacc71cd4817 instead of .2375.
  The actual graph again required the conditional fbjni 0.8.1 -> 0.7.0 repair.
  Cloud cold launches passed before signing and publication.
- Published [0.0.43-nightly.20260928.2402](https://github.com/r3xsean/t3code-android-nightly/releases/tag/0.0.43-nightly.20260928.2402),
  version code 1790621313, runtime d20ca524fc3e78262adb039f8f78b615f4ec40d9.
  Public APK SHA-256:
  `01bd3caa4ce19bd6213cdc09b5930d00ce41f659dce08ddcad1675200c2e9509`.
  Downloaded checksum, package/version, and persistent signing certificate
  all verified. The signed public APK installed in-place over original signed
  .2318 on the native ARM64 emulator, preserved a sandbox test-data marker,
  and passed two offline cold launches with an empty crash log. No actual
  phone/account connection was tested or user phone data accessed.
