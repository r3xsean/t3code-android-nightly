export const NIGHTLY_PATTERN =
  /^v(\d+)\.(\d+)\.(\d+)-nightly\.(\d{8})\.(\d+)$/;
export const PROCESSED_REF_PREFIX = "refs/tags/processed-nightly/";

function tagParts(tag) {
  const match = tag?.match(NIGHTLY_PATTERN);
  if (!match) {
    throw new Error(`Invalid nightly tag: ${tag}`);
  }
  return match.slice(1).map(BigInt);
}

export function compareNightlyTags(left, right) {
  const a = tagParts(left);
  const b = tagParts(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] < b[index]) return -1;
    if (a[index] > b[index]) return 1;
  }
  return 0;
}

export function processedRef(tag) {
  tagParts(tag);
  return `${PROCESSED_REF_PREFIX}${tag}`;
}

export function processedTagFromRefs(refs) {
  const tags = refs
    .map((entry) =>
      typeof entry?.ref === "string" &&
      entry.ref.startsWith(PROCESSED_REF_PREFIX)
        ? entry.ref.slice(PROCESSED_REF_PREFIX.length)
        : null,
    )
    .filter((tag) => NIGHTLY_PATTERN.test(tag ?? ""))
    .sort(compareNightlyTags);
  return tags.at(-1) ?? "";
}
