export function releaseBody(item, certificateSha256) {
  return `<!-- android-version-code: ${item.version_code} -->
<!-- upstream-release-id: ${item.upstream_release_id} -->

# Unofficial T3 Code Android nightly

Built automatically from the official T3 Code nightly
[\`${item.upstream_tag}\`](https://github.com/pingdotgg/t3code/releases/tag/${item.upstream_tag}).

| Field | Value |
| --- | --- |
| Upstream commit | [\`${item.upstream_sha}\`](https://github.com/pingdotgg/t3code/commit/${item.upstream_sha}) |
| Upstream published | \`${item.upstream_published_at}\` |
| Android package | \`dev.r3xsean.t3code.nightly\` |
| Android version name | \`${item.version_name}\` |
| Android version code | \`${item.version_code}\` |
| Signing certificate SHA-256 | \`${certificateSha256}\` |

Install and update through
[Obtainium](https://apps.obtainium.imranr.dev/redirect?r=obtainium://add/https%3A%2F%2Fgithub.com%2Fr3xsean%2Ft3code-android-nightly).
This arm64 companion is not endorsed by T3 Tools Inc.
`;
}
