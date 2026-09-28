#!/usr/bin/env bash
set -euo pipefail
builder_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
gradle_wrapper="$(cd -- "$(dirname -- "$1")" && pwd)/$(basename -- "$1")"
fixture_dir="$(mktemp -d)"
cp -R "$builder_dir/test/fixtures/gradle-probe/." "$fixture_dir/"
output="$("$gradle_wrapper" --project-dir "$fixture_dir" --init-script "$builder_dir/scripts/probe-fbjni.gradle" :app:t3CompanionResolvedFbjni --quiet --no-daemon)"
printf '%s\n' "$output"
printf '%s\n' "$output" | grep -Fx 'T3_FBJNI=["0.7.0"]'
echo 'PASS: actual Gradle composite build resolves the app graph without probing its plugin build'
