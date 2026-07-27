#!/usr/bin/env bash
set -euo pipefail

apk_path="$1"
expected_package="$2"
expected_version_code="$3"
expected_version_name="$4"
metadata_path="$5"
expected_abi="$6"

build_tools_dir="${ANDROID_HOME:?}/build-tools/${ANDROID_BUILD_TOOLS_VERSION:?}"
apksigner="$build_tools_dir/apksigner"
aapt2="$build_tools_dir/aapt2"
test -x "$apksigner"
test -x "$aapt2"

"$apksigner" verify --verbose --print-certs "$apk_path" > "$RUNNER_TEMP/apksigner.txt"
all_badging="$("$aapt2" dump badging "$apk_path")"
badging="${all_badging%%$'\n'*}"
native_code="$(
  printf '%s\n' "$all_badging" |
    sed -n 's/^native-code: //p'
)"

case "$badging" in
  *"name='$expected_package'"*"versionCode='$expected_version_code'"*"versionName='$expected_version_name'"*) ;;
  *)
    echo "Unexpected APK identity: $badging" >&2
    exit 1
    ;;
esac
if [[ "$native_code" != "'$expected_abi'" ]]; then
  echo "Unexpected APK native code: $native_code" >&2
  exit 1
fi

certificate_sha256="$(
  script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  node "$script_dir/apk-certificate.mjs" "$RUNNER_TEMP/apksigner.txt"
)"
expected_certificate_sha256="${EXPECTED_CERTIFICATE_SHA256:?}"
if [[ "$certificate_sha256" != "$expected_certificate_sha256" ]]; then
  echo "Unexpected signing certificate fingerprint: $certificate_sha256" >&2
  exit 1
fi

apk_sha256="$(shasum -a 256 "$apk_path" | awk '{print $1}')"
printf '%s  %s\n' "$apk_sha256" "$(basename "$apk_path")" > "$apk_path.sha256"
export CERTIFICATE_SHA256="$certificate_sha256"
export APK_SHA256="$apk_sha256"
export EXPECTED_PACKAGE="$expected_package"
export VERSION_CODE="$expected_version_code"
export VERSION_NAME="$expected_version_name"
export EXPECTED_ABI="$expected_abi"

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
    abi: process.env.EXPECTED_ABI,
    certificate_sha256: process.env.CERTIFICATE_SHA256,
    apk_sha256: process.env.APK_SHA256
  };
  fs.writeFileSync(process.argv[1], `${JSON.stringify(output, null, 2)}\n`);
' "$metadata_path"
