#!/usr/bin/env bash
set -euo pipefail
if node scripts/smoke-android.mjs broken/t3code-nightly-0.0.43-nightly.20260926.2318.apk broken-evidence; then
  echo 'Broken .2318 unexpectedly passed the launch gate' >&2
  exit 1
fi
grep -F 'libfbjni.so' broken-evidence/crash-log.txt
adb -s emulator-5554 uninstall dev.r3xsean.t3code.nightly
node scripts/smoke-android.mjs candidate.apk fixed-evidence
