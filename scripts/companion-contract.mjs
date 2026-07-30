export const APPLICATION_ID = "dev.r3xsean.t3code.nightly";
export const DISPLAY_NAME = "T3 Code Nightly";
export const EXPO_SLUG = "t3-code-android-nightly";
export const FINGERPRINT_VERSION_CODE = 1;
export const FINGERPRINT_VERSION_NAME = "0.0.0-nightly.19700101.1";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const FINGERPRINT_SOURCE = "[0-9a-f]{40}";
export const FINGERPRINT_PATTERN = new RegExp(`^${FINGERPRINT_SOURCE}$`);
export const VERSION_NAME_PATTERN =
  /^\d+\.\d+\.\d+-nightly\.\d{8}\.\d+$/;
export const EXPO_OWNER_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,37}[A-Za-z0-9])?$/;
export const UPDATE_CHANNEL_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function validateCompanionDelivery({
  expoProjectId,
  expoOwner,
  updateChannel,
  runtimeVersion,
  versionName,
}) {
  if (!UUID_PATTERN.test(expoProjectId ?? "")) {
    throw new Error("Expo project ID must be a UUID");
  }
  if (!EXPO_OWNER_PATTERN.test(expoOwner ?? "")) {
    throw new Error("Expo owner is invalid");
  }
  if (!UPDATE_CHANNEL_PATTERN.test(updateChannel ?? "")) {
    throw new Error("Expo update channel is invalid");
  }
  if (
    runtimeVersion !== undefined &&
    !FINGERPRINT_PATTERN.test(runtimeVersion ?? "")
  ) {
    throw new Error("Expo runtime version must be a native fingerprint");
  }
  if (
    versionName !== undefined &&
    !VERSION_NAME_PATTERN.test(versionName ?? "")
  ) {
    throw new Error("Expo update version must be a nightly version");
  }
}

export function companionExpoConfig({
  expoProjectId,
  expoOwner,
  updateChannel,
  runtimeVersion,
  versionName,
}) {
  if (runtimeVersion === undefined || versionName === undefined) {
    throw new Error("Expo runtime version and update version are required");
  }
  validateCompanionDelivery({
    expoProjectId,
    expoOwner,
    updateChannel,
    runtimeVersion,
    versionName,
  });
  return {
    name: DISPLAY_NAME,
    slug: EXPO_SLUG,
    owner: expoOwner,
    version: versionName,
    runtimeVersion,
    updates: {
      enabled: true,
      url: `https://u.expo.dev/${expoProjectId}`,
      requestHeaders: {
        "expo-channel-name": updateChannel,
      },
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
    },
    android: {
      package: APPLICATION_ID,
    },
    extra: {
      eas: {
        projectId: expoProjectId,
      },
    },
  };
}
