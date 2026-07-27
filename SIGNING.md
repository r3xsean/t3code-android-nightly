# Signing identity

Every companion APK must verify against this persistent certificate:

```text
SHA-256
3E:AA:E0:8E:E4:FA:2F:8A:2D:2A:85:FE:35:98:40:26:7F:6E:02:2B:19:63:C1:9A:60:76:8D:96:EE:40:57:8B
```

The private PKCS#12 identity is not stored in this repository. GitHub Actions
receives it through repository secrets. Sean's encrypted recovery copies are:

- `~/Documents/T3CodeNightlySigning/t3code-android-nightly.p12`
- iCloud Drive → `T3 Code Nightly Signing/t3code-android-nightly.p12`

The password is stored in macOS Keychain under the service
`T3 Code Android Nightly Signing`.

Changing the certificate breaks Android's in-place update path. Verify release
metadata and `apksigner --print-certs` output against this fingerprint.
