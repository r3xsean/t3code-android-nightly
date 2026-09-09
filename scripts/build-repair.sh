#!/usr/bin/env bash
set -euo pipefail

builder_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$(cd -- "$1" && pwd)"
output_dir="${2:?Output directory required}"
mkdir -p "$output_dir"
node "$builder_dir/scripts/upstream-compat.mjs" "$source_dir"
cd "$source_dir"
vp install
node "$builder_dir/scripts/prepare-source.mjs" fingerprint "$source_dir"
node "$builder_dir/scripts/align-react.mjs" "$source_dir"
vp install --no-frozen-lockfile
node "$builder_dir/scripts/align-react.mjs" "$source_dir" --check
cd "$source_dir/apps/mobile"
vp run typecheck
vp exec fingerprint fingerprint:generate --platform android > "$output_dir/fingerprint.json"
native_fingerprint="$(node --input-type=module -e 'import {readFileSync} from "node:fs"; console.log(JSON.parse(readFileSync(process.argv[1], "utf8")).hash)' "$output_dir/fingerprint.json")"
node "$builder_dir/scripts/prepare-source.mjs" finalize "$source_dir" "$VERSION_CODE" "$VERSION_NAME" "$native_fingerprint"
vp exec expo config --type public --json > "$output_dir/expo-config.json"
vp exec expo prebuild --clean --platform android
cd android
./gradlew assembleRelease --no-daemon --stacktrace
cp app/build/outputs/apk/release/app-release.apk "$output_dir/app.apk"
