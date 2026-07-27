const NIGHTLY_TAG =
  /^v\d+\.\d+\.\d+-nightly\.\d{8}\.\d+$/;

export const UPSTREAM_REPOSITORY = "pingdotgg/t3code";
export const DOWNSTREAM_TAG_PREFIX = "android-";
export const MAX_ANDROID_VERSION_CODE = 2_100_000_000;

export function isQualifyingNightly(release) {
  return (
    release?.draft === false &&
    release?.prerelease === true &&
    typeof release?.tag_name === "string" &&
    NIGHTLY_TAG.test(release.tag_name) &&
    Number.isInteger(Date.parse(release.published_at))
  );
}

export function androidVersionCode(publishedAt) {
  const milliseconds = Date.parse(publishedAt);
  if (!Number.isFinite(milliseconds)) {
    throw new Error(`Invalid upstream publication time: ${publishedAt}`);
  }

  const code = Math.floor(milliseconds / 1000);
  if (code < 1 || code > MAX_ANDROID_VERSION_CODE) {
    throw new Error(`Android version code is out of range: ${code}`);
  }
  return code;
}

export function androidVersionName(tag) {
  if (!NIGHTLY_TAG.test(tag)) {
    throw new Error(`Invalid nightly tag: ${tag}`);
  }
  return tag.slice(1);
}

export function downstreamTag(tag) {
  if (!NIGHTLY_TAG.test(tag)) {
    throw new Error(`Invalid nightly tag: ${tag}`);
  }
  return `${DOWNSTREAM_TAG_PREFIX}${tag}`;
}

export function existingVersionCodes(releases) {
  return releases
    .filter((release) => release?.draft === false)
    .map((release) => {
      const match = release?.body?.match(
        /<!-- android-version-code: (\d+) -->/,
      );
      return match ? Number.parseInt(match[1], 10) : null;
    })
    .filter(Number.isInteger);
}

export function selectCandidates(upstreamReleases, downstreamReleases) {
  const qualifying = upstreamReleases
    .filter(isQualifyingNightly)
    .map((release) => ({
      ...release,
      version_code: androidVersionCode(release.published_at),
    }))
    .sort((left, right) => {
      const codeOrder = left.version_code - right.version_code;
      if (codeOrder !== 0) {
        return codeOrder;
      }
      const leftSequence = BigInt(left.tag_name.split(".").at(-1));
      const rightSequence = BigInt(right.tag_name.split(".").at(-1));
      return leftSequence < rightSequence
        ? -1
        : leftSequence > rightSequence
          ? 1
          : 0;
    });

  if (qualifying.length === 0) {
    return [];
  }

  const publishedDownstream = downstreamReleases.filter(
    (release) =>
      release?.draft === false &&
      typeof release?.tag_name === "string" &&
      release.tag_name.startsWith(`${DOWNSTREAM_TAG_PREFIX}v`),
  );
  const existingTags = new Set(
    publishedDownstream.map((release) => release.tag_name),
  );
  const codes = existingVersionCodes(publishedDownstream);
  if (codes.length !== publishedDownstream.length) {
    throw new Error("Published companion release is missing its version marker");
  }
  if (new Set(codes).size !== codes.length) {
    throw new Error("Published companions contain colliding Android version codes");
  }

  const floor = codes.length === 0 ? 0 : Math.max(...codes);
  const eligible = qualifying.filter(
    (release) =>
      release.version_code > floor &&
      !existingTags.has(downstreamTag(release.tag_name)),
  );
  return eligible.length === 0 ? [] : [eligible.at(-1)];
}

export async function resolveCommitSha(api, tag) {
  let object = await api(
    `/repos/${UPSTREAM_REPOSITORY}/git/ref/tags/${encodeURIComponent(tag)}`,
  ).then((response) => response.object);

  const visited = new Set();
  while (object.type === "tag") {
    if (visited.has(object.sha)) {
      throw new Error(`Annotated tag cycle detected for ${tag}`);
    }
    visited.add(object.sha);
    object = await api(
      `/repos/${UPSTREAM_REPOSITORY}/git/tags/${object.sha}`,
    ).then((response) => response.object);
  }

  if (object.type !== "commit" || !/^[0-9a-f]{40}$/.test(object.sha)) {
    throw new Error(`Tag ${tag} does not resolve to a commit`);
  }
  return object.sha;
}
