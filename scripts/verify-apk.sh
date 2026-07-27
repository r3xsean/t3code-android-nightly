#!/usr/bin/env bash
set -euo pipefail

apk_path="$1"
expected_package="$2"
expected_version_code="$3"
expected_version_name="$4"
metadata_path="$5"

build_tools_dir="$(
  find "${ANDROID_HOME:?}/build-tools" -mindepth 1 -maxdepth 1 -type d |
    sort -V |
    tail -n 1
)"
apksigner="$build_tools_dir/apksigner"
aapt2="$build_tools_dir/aapt2"

"$apksigner" verify --verbose --print-certs "$apk_path" > "$RUNNER_TEMP/apksigner.txt"
badging="$("$aapt2" dump badging "$apk_path" | head -n 1)"

case "$badging" in
  *"name='$expected_package'"*"versionCode='$expected_version_code'"*"versionName='$expected_version_name'"*) ;;
  *)
    echo "Unexpected APK identity: $badging" >&2
    exit 1
    ;;
esac

certificate_sha256="$(
  sed -n 's/^Signer #1 certificate SHA-256 digest: //p' "$RUNNER_TEMP/apksigner.txt" |
    head -n 1 |
    tr '[:lower:]' '[:upper:]'
)"
if [[ ! "$certificate_sha256" =~ ^[0-9A-F]{64}$ ]]; then
  echo "Could not read signing certificate fingerprint" >&2
  exit 1
fi

apk_sha256="$(shasum -a 256 "$apk_path" | awk '{print $1}')"
printf '%s  %s\n' "$apk_sha256" "$(basename "$apk_path")" > "$apk_path.sha256"

# The JavaScript template literal is intentionally protected from shell expansion.
# shellcheck disable=SC2016
node -e '
  const fs = require("node:fs");
  const output = {
    upstream_tag: process.env.UPSTREAM_TAG,
    upstream_release_id: Number(process.env.UPSTREAM_RELEASE_ID),
    upstream_published_at: process.env.UPSTREAM_PUBLISHED_AT,
    upstream_sha: process.env.UPSTREAM_SHA,
    version_code: Number(process.env.VERSION_CODE),
    version_name: process.env.VERSION_NAME,
    package_id: process.env.EXPECTED_PACKAGE,
    certificate_sha256: process.env.CERTIFICATE_SHA256,
    apk_sha256: process.env.APK_SHA256
  };
  fs.writeFileSync(process.argv[1], `${JSON.stringify(output, null, 2)}\n`);
' "$metadata_path"
