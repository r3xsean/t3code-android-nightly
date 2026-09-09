import { readFile } from "node:fs/promises";
import path from "node:path";
import { verifyExpoConfig as verifyConnect } from "./connect-config.mjs";
import { parseFingerprintOutput } from "./hybrid-delivery.mjs";
import { verifyExpoConfig } from "./verify-expo-config.mjs";

const directory = process.argv[2];
const fingerprint = parseFingerprintOutput(await readFile(path.join(directory, "fingerprint.json"), "utf8"));
const config = JSON.parse(await readFile(path.join(directory, "expo-config.json"), "utf8"));
verifyConnect(config);
verifyExpoConfig(config, { expoProjectId: process.env.EXPO_PROJECT_ID, expoOwner: process.env.EXPO_OWNER,
  updateChannel: process.env.EXPO_UPDATE_CHANNEL, runtimeVersion: fingerprint, versionName: process.env.VERSION_NAME });
const badging = await readFile(path.join(directory, "badging.txt"), "utf8");
const first = badging.split("\n")[0];
for (const expected of ["name='dev.r3xsean.t3code.nightly'", `versionCode='${process.env.VERSION_CODE}'`, `versionName='${process.env.VERSION_NAME}'`]) {
  if (!first.includes(expected)) throw new Error(`Candidate APK has unexpected identity: ${first}`);
}
if (!/^native-code: 'arm64-v8a'\r?$/m.test(badging)) throw new Error("Candidate APK has an unexpected architecture");
console.log("Independent candidate APK identity, ABI, Expo runtime/channel and T3 Connect checks passed");
