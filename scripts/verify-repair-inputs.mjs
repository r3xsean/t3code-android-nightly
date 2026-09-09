import { appendFile } from "node:fs/promises";
import { githubApi } from "./github-api.mjs";
import { REPOSITORY } from "./delivery-health.mjs";
import { NIGHTLY_PATTERN } from "./processed-state.mjs";
import { resolveCommitSha } from "./nightlies.mjs";
import { validateCandidateDiff } from "./repair-policy.mjs";

const { CANDIDATE_SHA: candidate, BASE_SHA: base, UPSTREAM_TAG: tag, GITHUB_SHA: verifier } = process.env;
if (![candidate, base, verifier].every((sha) => /^[a-f0-9]{40}$/.test(sha ?? "")) || base !== verifier || !NIGHTLY_PATTERN.test(tag ?? "")) throw new Error("Invalid immutable verification inputs or main moved before verification");
const api = githubApi(process.env.GITHUB_TOKEN);
validateCandidateDiff(await api(`/repos/${REPOSITORY}/compare/${base}...${candidate}`), base);
const release = await api(`/repos/pingdotgg/t3code/releases/tags/${tag}`);
if (release.draft || !release.prerelease) throw new Error("Expected a published official nightly");
const versionCode = Math.floor(Date.parse(release.published_at) / 1000);
if (!Number.isSafeInteger(versionCode) || versionCode <= 0) throw new Error("Invalid upstream publication time");
const upstream = await resolveCommitSha(api, tag);
await appendFile(process.env.GITHUB_OUTPUT, `upstream_sha=${upstream}\nversion_code=${versionCode}\nversion_name=${tag.slice(1)}\n`);
